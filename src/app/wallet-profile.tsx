"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { AddressAvatar } from "@/lib/address-avatar";

// If eth_requestAccounts is already pending from an earlier click the
// wallet never resolved (e.g. its popup got closed via the OS window
// controls instead of Reject), MetaMask coalesces a new request into that
// stuck one instead of opening a fresh window — so it just badges the
// toolbar icon and this promise never settles. There's no event for
// "your request is stuck"; a timeout is the only way to say something
// useful instead of leaving the button disabled forever with no
// explanation.
const STUCK_CONNECT_HINT_MS = 4000;

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// A profile card in the GitHub-sidebar sense only: avatar + address as
// "username." Connecting a wallet here never signs anything and this
// address never touches a write — see the comment in src/lib/wallet.ts.
export default function WalletProfile() {
  const { address, connecting, error, connect, disconnect } = useWallet();
  const [showStuckHint, setShowStuckHint] = useState(false);

  useEffect(() => {
    if (!connecting) return;
    const timer = setTimeout(() => setShowStuckHint(true), STUCK_CONNECT_HINT_MS);
    return () => {
      clearTimeout(timer);
      setShowStuckHint(false);
    };
  }, [connecting]);

  return (
    <div className="flex flex-col items-center text-center gap-3 border border-[#6b4552] rounded-md p-4">
      <AddressAvatar address={address ?? "0x0000000000000000000000000000000000000000"} size={72} />
      {address ? (
        <>
          <div className="font-mono text-sm text-[#fff8fa] break-all" title={address}>
            {short(address)}
          </div>
          <button
            onClick={disconnect}
            className="text-xs text-[#dfa8b7] hover:text-[#f06fa8] cursor-pointer"
          >
            Disconnect
          </button>
        </>
      ) : (
        <>
          <div className="text-sm text-[#dfa8b7]">Not connected</div>
          <button
            onClick={connect}
            disabled={connecting}
            className="w-full px-3 py-1.5 rounded-md border border-[#f06fa8] text-[#f06fa8] text-xs hover:bg-[#f06fa8]/10 cursor-pointer disabled:opacity-50"
          >
            {connecting ? "Connecting…" : "Connect wallet"}
          </button>
        </>
      )}
      {showStuckHint && (
        <p className="text-xs text-[#dfa8b7]">
          Taking a while — check your browser toolbar, MetaMask may have a pending request waiting there.
        </p>
      )}
      {error && <p className="text-xs font-semibold text-[#f06fa8]">{error}</p>}
    </div>
  );
}
