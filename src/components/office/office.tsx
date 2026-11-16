"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { PERSONAS } from "@/lib/personas";
import { useSnapshot } from "@/lib/use-snapshot";
import { STATUS } from "./status";

const OfficeScene = dynamic(() => import("./scene"), {
  ssr: false,
  loading: () => <div role="status" className="grid h-full place-items-center text-sm text-stone-600">Menyiapkan kota 3D…</div>,
});
type Direction = "zoom-in" | "zoom-out" | "reset" | "north" | "south" | "east" | "west";
const button = "grid h-11 min-w-11 place-items-center rounded-xl border border-white/15 bg-[#252a26]/95 px-3 text-sm text-stone-100 shadow-lg transition-colors hover:bg-[#41483c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200";

export function Office() {
  const { snapshot, error } = useSnapshot();
  const [selected, setSelected] = useState<string | null>("yesus");
  const [panel, setPanel] = useState<"people" | "telemetry" | null>(null);
  const [cameraAction, setCameraAction] = useState<{kind:Direction;serial:number}>();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const persona = PERSONAS.find((person) => person.id === selected);
  const move = (kind:Direction) => setCameraAction(previous => ({kind,serial:(previous?.serial ?? 0)+1}));
  useEffect(() => {
    if (!panel) return;
    closeButton.current?.focus();
    const key = (event:KeyboardEvent) => {
      if (event.key === "Escape") { setPanel(null); trigger.current?.focus(); }
    };
    window.addEventListener("keydown",key);
    return () => window.removeEventListener("keydown",key);
  },[panel]);
  const close = () => { setPanel(null); trigger.current?.focus(); };
  return <main className="fixed inset-0 isolate overflow-hidden bg-[#d7c39d] text-stone-200">
    <section aria-label="Peta kota 3D" className="absolute inset-0 touch-none">
      <OfficeScene agents={snapshot?.agents ?? []} selected={selected} onSelect={setSelected} cameraAction={cameraAction} />
    </section>
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 bg-gradient-to-b from-black/35 to-transparent p-3 pb-12 sm:p-5 sm:pb-14">
      <div className="drop-shadow-md"><h1 className="text-lg font-semibold tracking-tight text-white sm:text-2xl">Jesus-Office</h1><p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-stone-100">Kota kuno · peta interaktif</p></div>
      <nav aria-label="Panel peta" className="pointer-events-auto flex gap-2">
        <button type="button" aria-expanded={panel==='people'} onClick={event=>{trigger.current=event.currentTarget;setPanel(panel==='people'?null:'people');}} className={button}>Penghuni</button>
        <button type="button" aria-expanded={panel==='telemetry'} onClick={event=>{trigger.current=event.currentTarget;setPanel(panel==='telemetry'?null:'telemetry');}} className={button}>Telemetri</button>
      </nav>
    </header>
    <nav aria-label="Navigasi peta" className="absolute bottom-24 right-3 z-10 flex flex-col items-end gap-2 sm:bottom-8 sm:right-5">
      <div className="flex gap-1">
        <button type="button" aria-label="Perkecil peta" className={button} onClick={()=>move('zoom-out')}>−</button>
        <button type="button" aria-label="Perbesar peta" className={button} onClick={()=>move('zoom-in')}>+</button>
        <button type="button" aria-label="Reset peta" className={button} onClick={()=>move('reset')}>Reset</button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <span /><button type="button" aria-label="Geser utara" className={button} onClick={()=>move('north')}>↑</button><span />
        <button type="button" aria-label="Geser barat" className={button} onClick={()=>move('west')}>←</button>
        <button type="button" aria-label="Geser selatan" className={button} onClick={()=>move('south')}>↓</button>
        <button type="button" aria-label="Geser timur" className={button} onClick={()=>move('east')}>→</button>
      </div>
    </nav>
    <footer className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/55 to-transparent px-4 pb-4 pt-10 sm:right-auto sm:rounded-tr-3xl sm:px-5">
      <p className="text-xs text-white">{persona?.name ?? 'Jelajahi kota'} <span className="mx-1 text-white/50">·</span> Geser peta · scroll / cubit untuk zoom</p>
      <p className="mt-1 max-w-sm text-[10px] leading-relaxed text-stone-200">Animasi & percakapan visual adalah demo, bukan pesan atau pekerjaan agent live.</p>
    </footer>
    {panel && <aside aria-label={panel==='people'?'Panel penghuni':'Panel telemetri'} className="absolute bottom-4 right-3 top-24 z-20 flex w-[calc(100%_-_24px)] max-w-[340px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#1d241f]/95 shadow-2xl backdrop-blur-md sm:bottom-5 sm:right-5 sm:top-20">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><h2 className="text-sm font-medium">{panel==='people'?'Penghuni kota':'Telemetri Hermes'}</h2><button ref={closeButton} type="button" aria-label="Tutup panel" onClick={close} className={button}>×</button></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {panel==='people' ? <>
          <div className="mb-4"><p className="text-lg text-stone-100">{persona?.name ?? 'Pilih penghuni'}</p><p className="text-xs text-stone-400">{persona?.role}</p></div>
          <nav aria-label="Penghuni office"><ol className="space-y-1">{PERSONAS.map((person,index)=><li key={person.id}>
            <button type="button" data-persona-id={person.id} aria-pressed={selected===person.id} onClick={()=>setSelected(person.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs focus-visible:outline-2 focus-visible:outline-amber-200 ${selected===person.id?'bg-[#d3bd92]/15 text-[#edddbc]':'text-stone-300 hover:bg-white/5'}`}>
              <span aria-hidden className="w-4 font-mono text-stone-500">{String(index+1).padStart(2,'0')}</span><span aria-hidden className="h-2 w-2 rounded-full" style={{backgroundColor:person.mantle}}/><span>{person.name}</span>
            </button>
          </li>)}</ol></nav>
          <p className="mt-5 text-[11px] leading-relaxed text-stone-400">Persona artistik, bukan daftar agent terverifikasi. Gerakan dan percakapan tidak menyatakan task sedang berjalan. Laptop sengaja anakronistis.</p>
        </> : <div className="space-y-3 text-[11px] text-stone-300">
          <p role="status">{error?'Koneksi terputus — data terakhir mungkin usang.':!snapshot?'Memuat data…':!snapshot.available?'Riwayat tidak tersedia.':'Data runtime terpisah dari persona visual.'}</p>
          {snapshot && <p>Diperbarui: <time dateTime={snapshot.generatedAt}>{snapshot.generatedAt.replace('T',' ').slice(0,19)} UTC</time></p>}
          <ul aria-label="Worker tasks" className="space-y-2">{snapshot?.agents.map(agent=><li key={agent.id} className="rounded-lg border border-white/10 p-3"><p className="break-all font-mono">{agent.run} · #{agent.task}</p><p className="mt-1">{STATUS[agent.status].label} · {agent.toolCalls} tools</p><p className="mt-1 break-all text-stone-400">Heartbeat: {agent.heartbeatAt ?? 'tidak tersedia'}</p></li>)}</ul>
          {snapshot?.available && snapshot.agents.length===0 && <p>Belum ada worker tercatat.</p>}
          <p>Tidak ada penugasan persona ke worker yang diasumsikan.</p>
        </div>}
      </div>
    </aside>}
  </main>;
}
