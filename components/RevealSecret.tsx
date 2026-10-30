"use client";

import { Eye, Flame, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CopyButton from "@/components/CopyButton";
import { decryptSecret, deriveKeys, isLinkKey } from "@/lib/crypto";

type State =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "gone"; message: string }
  | { status: "ready"; salt: string; p: boolean; error?: string }
  | { status: "revealing"; salt: string; p: boolean }
  | { status: "revealed"; text: string };

const GONE = "This secret doesn't exist, has expired, or was already viewed.";

export default function RevealSecret({
  id,
  validId,
}: {
  id: string;
  validId: boolean;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [passphrase, setPassphrase] = useState("");
  const linkKey = useRef<string | null>(null);

  useEffect(() => {
    // The key lives in the URL fragment, which only exists in the browser.
    async function load() {
      const key = window.location.hash.slice(1);
      if (!validId || !isLinkKey(key)) {
        setState({ status: "invalid" });
        return;
      }
      linkKey.current = key;

      // Only checks that the secret exists; nothing is burned until the
      // recipient clicks "Reveal".
      const response = await fetch(`/api/secrets/${id}`);
      if (response.status === 404) {
        setState({ status: "gone", message: GONE });
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState({ status: "ready", salt: data.salt, p: data.p });
    }

    load().catch((err: Error) =>
      setState({
        status: "gone",
        message: err.message || "Could not load the secret.",
      }),
    );
  }, [id, validId]);

  async function reveal(event: React.FormEvent) {
    event.preventDefault();
    if (state.status !== "ready" || !linkKey.current) return;
    const { salt, p } = state;

    setState({ status: "revealing", salt, p });
    try {
      const keys = await deriveKeys(
        linkKey.current,
        salt,
        p ? passphrase : undefined,
      );
      const response = await fetch(`/api/secrets/${id}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth: keys.auth }),
      });
      const data = await response.json();

      if (response.status === 403) {
        const attempts = `${data.attemptsLeft} attempt${data.attemptsLeft === 1 ? "" : "s"} left`;
        setState({
          status: "ready",
          salt,
          p,
          error: `Wrong passphrase. ${attempts}.`,
        });
        return;
      }
      if (response.status === 404) {
        setState({ status: "gone", message: GONE });
        return;
      }
      if (!response.ok) throw new Error(data.error);

      const text = await decryptSecret(keys.encKey, data, p);
      // Drop the key from the address bar and browser history.
      window.history.replaceState(null, "", window.location.pathname);
      linkKey.current = null;
      setPassphrase("");
      setState({ status: "revealed", text });
    } catch (err) {
      setState({
        status: "gone",
        message:
          err instanceof Error && err.message
            ? err.message
            : "The secret could not be decrypted.",
      });
    }
  }

  switch (state.status) {
    case "loading":
      return <span className="loading loading-dots text-muted" />;

    case "invalid":
      return (
        <Notice
          title="This link is incomplete."
          message="The key part of the link is missing or broken. Ask the sender to copy the whole link again."
        />
      );

    case "gone":
      return <Notice title="Nothing to see here." message={state.message} />;

    case "revealed":
      return (
        <div className="space-y-4">
          <textarea
            readOnly
            value={state.text}
            aria-label="Secret"
            rows={Math.min(14, Math.max(4, state.text.split("\n").length + 1))}
            className="textarea w-full font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <CopyButton value={state.text} />
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <Flame className="size-4 text-primary" />
              Deleted from the server. Copy it now, it won&apos;t be shown
              again.
            </p>
          </div>
        </div>
      );

    case "ready":
    case "revealing": {
      const busy = state.status === "revealing";
      return (
        <form
          onSubmit={reveal}
          className="rounded-box border border-line bg-base-200 p-5 sm:p-6"
        >
          <p className="flex items-start gap-2 text-sm text-muted">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
            You can view this secret only once. After that it&apos;s deleted for
            good.
          </p>
          {state.p && (
            <input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Passphrase"
              aria-label="Passphrase"
              autoComplete="off"
              autoFocus
              className="input mt-4 w-full"
            />
          )}
          {state.status === "ready" && state.error && (
            <div
              role="alert"
              className="alert alert-error alert-soft mt-4 text-sm"
            >
              {state.error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || (state.p && !passphrase)}
            className="btn btn-primary mt-4"
          >
            {busy ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <Eye className="size-4" />
            )}
            Reveal secret
          </button>
        </form>
      );
    }
  }
}

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-box border border-line bg-base-200 p-5 sm:p-6">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      <Link href="/" className="btn btn-ghost btn-sm mt-4 -ml-3">
        Share your own secret
      </Link>
    </div>
  );
}
