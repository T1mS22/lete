"use client";

import { KeyRound, Lock } from "lucide-react";
import { useState } from "react";
import CopyButton from "@/components/CopyButton";
import { DEFAULT_EXPIRY_SECONDS, EXPIRY_OPTIONS } from "@/lib/config";
import { encryptSecret, MAX_SECRET_BYTES } from "@/lib/crypto";

type Created = { link: string; expiresAt: string; withPassphrase: boolean };

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export default function CreateSecret() {
  const [text, setText] = useState("");
  const [ttl, setTtl] = useState<number>(DEFAULT_EXPIRY_SECONDS);
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const size = new TextEncoder().encode(text).length;
  const tooLarge = size > MAX_SECRET_BYTES;
  const canSubmit =
    text.length > 0 && !tooLarge && !busy && (!usePassphrase || passphrase);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    try {
      const withPassphrase = usePassphrase && passphrase.length > 0;
      const { secret, linkKey } = await encryptSecret(
        text,
        withPassphrase ? passphrase : undefined,
      );

      const response = await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...secret, ttl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Something went wrong.");

      setCreated({
        link: `${window.location.origin}/s/${data.id}#${linkKey}`,
        expiresAt: data.expiresAt,
        withPassphrase,
      });
      setText("");
      setPassphrase("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="rounded-box border border-line bg-base-200 p-5 sm:p-6">
        <p className="font-semibold">Your one-time link is ready.</p>
        <p className="mt-1 text-sm text-muted">
          It works once and expires{" "}
          {new Date(created.expiresAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          .
        </p>
        <input
          readOnly
          value={created.link}
          aria-label="One-time link"
          onFocus={(event) => event.currentTarget.select()}
          className="input mt-4 w-full font-mono text-sm"
        />
        {created.withPassphrase && (
          <div role="alert" className="alert alert-soft mt-4 text-sm">
            <KeyRound className="size-4 shrink-0" />
            Send the passphrase through a different channel than the link.
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <CopyButton value={created.link} label="Copy link" />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setCreated(null)}
          >
            Share another secret
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Your secret…"
          aria-label="Secret"
          rows={7}
          autoComplete="off"
          spellCheck={false}
          className="textarea w-full font-mono text-sm"
        />
        <p
          className={`mt-1 text-right text-xs ${tooLarge ? "text-error" : "text-faint"}`}
        >
          {formatBytes(size)} / {formatBytes(MAX_SECRET_BYTES)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Expires after</span>
          <select
            value={ttl}
            onChange={(event) => setTtl(Number(event.target.value))}
            className="select w-full"
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.seconds} value={option.seconds}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <label className="flex items-center gap-2 text-muted">
            <input
              type="checkbox"
              checked={usePassphrase}
              onChange={(event) => setUsePassphrase(event.target.checked)}
              className="checkbox checkbox-sm checkbox-primary"
            />
            Protect with a passphrase
          </label>
          <input
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            disabled={!usePassphrase}
            placeholder={usePassphrase ? "Passphrase" : "Optional"}
            aria-label="Passphrase"
            autoComplete="new-password"
            className="input w-full"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="alert alert-error alert-soft text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn btn-primary w-full sm:w-auto"
      >
        {busy ? (
          <span className="loading loading-spinner loading-sm" />
        ) : (
          <Lock className="size-4" />
        )}
        Create one-time link
      </button>
    </form>
  );
}
