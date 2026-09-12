"use client";
// Client-side only. Identity, postage stamp resolution and signing all
// happen inside the Swarm ID iframe (swarm-id.snaha.net) — this app never
// sees a batch id or a private key. We only ever call uploadFile/downloadFile
// and get back a Swarm reference (a content hash), which is what gets
// stored on Arkiv as a pointer.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { SwarmIdClient } from "@snaha/swarm-id";
import type { ConnectionInfo } from "@snaha/swarm-id";

let client: SwarmIdClient | null = null;
let latestInfo: ConnectionInfo | null = null;
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function getClient(): SwarmIdClient {
  if (!client) {
    client = new SwarmIdClient({
      iframeOrigin: "https://swarm-id.snaha.net",
      metadata: {
        name: "gitkiv",
        description: "Git-style commit history on Arkiv, file contents on Swarm.",
      },
      onConnectionChange: (info) => {
        latestInfo = info;
        notify();
      },
    });
  }
  return client;
}

function ensureInit(): Promise<void> {
  if (!initPromise) initPromise = getClient().initialize();
  return initPromise;
}

export function useSwarmId() {
  const info = useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => latestInfo,
    () => null
  );

  useEffect(() => {
    ensureInit().catch((err) => console.error("Swarm ID init failed:", err));
  }, []);

  const connect = useCallback(async () => {
    await ensureInit();
    await getClient().connect();
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    await ensureInit();
    return getClient().uploadFile(file);
  }, []);

  const downloadFile = useCallback(async (reference: string) => {
    await ensureInit();
    return getClient().downloadFile(reference);
  }, []);

  return { info, connect, uploadFile, downloadFile };
}
