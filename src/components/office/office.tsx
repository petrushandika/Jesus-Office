"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { PERSONAS } from "@/lib/personas";
import { useSnapshot } from "@/lib/use-snapshot";
import { STATUS } from "./status";

const OfficeScene = dynamic(() => import("./scene"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-stone-500">Menyiapkan ruang 3D…</div>,
});

export function Office() {
  const { snapshot, error } = useSnapshot();
  const [selected, setSelected] = useState<string | null>("yesus");
  const persona = PERSONAS.find((person) => person.id === selected);
  return (
    <main className="min-h-dvh bg-[#191c1a] text-stone-200 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 lg:px-8">
        <div><p className="text-[10px] font-medium uppercase tracking-[0.3em] text-[#c6ad7b]">Jesus-Office</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-stone-100">Jesus-Office</h1></div>
        <p className="text-xs tracking-wide text-stone-400">Yesus &amp; dua belas murid <span className="mx-2 text-stone-600">/</span> 13 penghuni</p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section aria-label="Ruang office 3D" className="relative h-[58vh] min-h-[360px] w-full shrink-0 overflow-hidden bg-[#eee8da] lg:h-auto lg:min-h-0 lg:flex-1">
          <OfficeScene agents={snapshot?.agents ?? []} selected={selected} onSelect={setSelected} />
          <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-stone-400/20 bg-stone-50/90 px-3 py-1.5 text-[10px] tracking-wider text-stone-600">PELATARAN KOTA KUNO · INTERPRETASI ARTISTIK</div>
          <p className="pointer-events-none absolute bottom-4 left-4 right-4 w-fit rounded-md bg-stone-50/90 px-3 py-2 text-[11px] text-stone-700">Geser untuk melihat ruang · pilih karakter atau nama</p>
        </section>
        <aside className="flex w-full shrink-0 flex-col border-t border-white/10 lg:w-[320px] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="border-b border-white/10 px-5 py-5">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#c6ad7b]">Penghuni terpilih</p>
            <h2 className="mt-2 text-xl font-medium text-stone-100">{persona?.name ?? "Pilih penghuni"}</h2>
            <p className="mt-1 text-xs text-stone-400">{persona?.role ?? "Pilih dari ruang atau daftar di bawah."}</p>
            <span className="mt-3 inline-flex rounded-full border border-[#b59b6a]/30 px-2.5 py-1 text-[10px] text-[#d3bd92]">Persona visual</span>
          </div>
          <nav aria-label="Penghuni office" className="px-3 py-3">
            <ol className="grid grid-cols-2 gap-1 lg:grid-cols-1">
              {PERSONAS.map((person,index) => <li key={person.id}>
                <button type="button" data-persona-id={person.id} aria-pressed={selected === person.id} onClick={() => setSelected(person.id)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-[#d3bd92] ${selected === person.id ? "bg-[#d3bd92]/10 text-[#edddbc]" : "text-stone-400 hover:bg-white/5 hover:text-stone-100"}`}>
                  <span aria-hidden className="w-4 shrink-0 font-mono text-[10px] text-stone-500">{String(index+1).padStart(2,"0")}</span>
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor:person.mantle}} />
                  <span>{person.name}</span>
                </button>
              </li>)}
            </ol>
          </nav>
          <p className="border-t border-white/10 px-5 py-4 text-[11px] leading-relaxed text-stone-500">Berjalan, duduk, dan mengetik adalah animasi artistik, bukan bukti pekerjaan agent. Terinspirasi Nazaret/Yerusalem kuno; laptop sengaja anakronistis. Matias menggantikan Yudas Iskariot.</p>
          <details className="border-t border-white/10 px-5 py-4">
            <summary className="cursor-pointer text-xs font-medium text-stone-300 focus-visible:outline-2 focus-visible:outline-[#d3bd92]">Telemetri Hermes</summary>
            <div className="mt-3 space-y-3 text-[11px] text-stone-400" aria-live="polite">
              <p>{error ? "Koneksi terputus — data terakhir mungkin usang." : !snapshot ? "Memuat data…" : !snapshot.available ? "Riwayat tidak tersedia." : "Data runtime terpisah dari persona visual."}</p>
              {snapshot && <p>Diperbarui: <time dateTime={snapshot.generatedAt}>{snapshot.generatedAt.replace("T"," ").slice(0,19)} UTC</time></p>}
              <ul aria-label="Worker tasks" className="space-y-2">{snapshot?.agents.map(agent => <li key={agent.id} className="rounded border border-white/10 p-2">
                <p className="break-all font-mono text-stone-300">{agent.run} · #{agent.task}</p><p>{STATUS[agent.status].label} · {agent.toolCalls} tools</p><p className="mt-1 break-all">Heartbeat: {agent.heartbeatAt ?? "tidak tersedia"}</p>
              </li>)}</ul>
              {snapshot?.available && snapshot.agents.length===0 && <p>Belum ada worker tercatat.</p>}
              <p>Tidak ada penugasan persona ke worker yang diasumsikan.</p>
            </div>
          </details>
        </aside>
      </div>
    </main>
  );
}
