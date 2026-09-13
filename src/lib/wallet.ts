"use client";
// A "who's browsing" identity badge, styled after a GitHub avatar+username
// — nothing more. Connecting here only ever calls eth_requestAccounts to
// read an address; it never signs anything, and this address is never
// used to author a commit or any other Arkiv write. Every write in this
// app is still signed server-side by the single writer key in
// src/lib/arkiv/write.ts, entirely independent of whatever's connected
// here. This is intentionally not wagmi/viem-backed — there's nothing to
// sign, so the raw EIP-1193 provider is all that's needed.
import { useCallback, useEffect, useState } from "react";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  providers?: Eip1193Provider[];
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

const STORAGE_KEY = "gitkiv:wallet-address";

// Multiple installed wallet extensions (MetaMask + Coinbase Wallet, Phantom,
// etc.) commonly fight over window.ethereum — the last one to inject wins,
// or some wallets expose every provider under window.ethereum.providers
// instead. If that array exists, prefer the one flagged isMetaMask rather
// than silently talking to whichever extension happened to load last —
// otherwise eth_requestAccounts can resolve or reject against a wallet the
// user never sees pop up a window for, which looks exactly like "nothing
// happened."
function getProvider(): Eip1193Provider | undefined {
  const eth = window.ethereum;
  if (!eth) return undefined;
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    return eth.providers.find((p) => p.isMetaMask) ?? eth.providers[0];
  }
  return eth;
}

// MetaMask's own EIP-1193 error codes — surfaced with an actionable
// message instead of a raw "Already processing eth_requestAccounts.
// Please wait." that's easy to miss under a small button.
function describeConnectError(err: unknown): string {
  const code = (err as { code?: number } | null)?.code;
  if (code === 4001) return "Connection request was rejected in the wallet.";
  if (code === -32002)
    return "A wallet popup is already open — check your browser toolbar (or other tabs) and approve or dismiss it first.";
  return err instanceof Error ? err.message : "Failed to connect wallet.";
}

export function useWallet() {
  // Always starts null — including in a lazy useState initializer, which
  // runs during SSR too, where localStorage doesn't exist. Restoring it
  // there would make the client's pre-hydration render disagree with the
  // server-rendered HTML (address vs. placeholder), which is exactly what
  // caused this component's hydration mismatch. The restore has to happen
  // in an effect instead: effects only ever run client-side, after
  // hydration, so this divergence from the server's render is deliberate
  // and safe, not a bug — the ESLint set-state-in-effect rule can't tell
  // the difference and would otherwise flag it.
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above useState(null)
      if (stored) setAddress(stored);
    } catch {
      // private browsing / storage disabled — just skip the restore
    }

    const provider = getProvider();
    if (!provider) return;

    // eth_accounts (unlike eth_requestAccounts) never prompts — this
    // silently re-syncs if the site is already authorized in the wallet.
    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (list.length > 0) {
          setAddress(list[0]);
          try {
            localStorage.setItem(STORAGE_KEY, list[0]);
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // no accounts authorized yet — not an error worth surfacing
      });

    function handleAccountsChanged(...args: unknown[]) {
      const accounts = args[0] as string[];
      if (accounts.length === 0) {
        setAddress(null);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      } else {
        setAddress(accounts[0]);
        try {
          localStorage.setItem(STORAGE_KEY, accounts[0]);
        } catch {
          // ignore
        }
      }
    }

    provider.on?.("accountsChanged", handleAccountsChanged);
    return () => provider.removeListener?.("accountsChanged", handleAccountsChanged);
  }, []);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setError("No wallet extension detected (e.g. MetaMask).");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts[0]) {
        setAddress(accounts[0]);
        try {
          localStorage.setItem(STORAGE_KEY, accounts[0]);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      // Logged raw, not just the friendly message below — MetaMask's error
      // objects (code + data) are more useful in devtools than
      // `String(err)` alone when this needs debugging further.
      console.error("[wallet] connect failed:", err);
      setError(describeConnectError(err));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    // Injected wallets have no real "disconnect" — this only forgets the
    // address locally; the site stays authorized in the wallet itself
    // until the user revokes it there.
    setAddress(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { address, connecting, error, connect, disconnect };
}
