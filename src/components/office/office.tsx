"use client";

import dynamic from "next/dynamic";
import { useState, type KeyboardEvent } from "react";
import { PERSONAS } from "@/lib/personas";

const OfficeScene = dynamic(() => import("./scene"), {
  ssr: false,
  loading: () => <div role="status" className="grid h-full place-items-center text-sm text-stone-600">Menyiapkan kota 3D…</div>,
});
type Direction = "zoom-in" | "zoom-out" | "reset" | "north" | "south" | "east" | "west";

export function Office() {
  const [selected, setSelected] = useState<string | null>(null);
  const [cameraAction, setCameraAction] = useState<{kind:Direction;serial:number}>();
  const persona = PERSONAS.find(person => person.id === selected);
  function onKeyDown(event:KeyboardEvent<HTMLElement>) {
    const actions:Record<string,Direction>={ArrowUp:'north',ArrowDown:'south',ArrowLeft:'west',ArrowRight:'east','+':'zoom-in','=':'zoom-in','-':'zoom-out','0':'reset'};
    if (actions[event.key]) {event.preventDefault();setCameraAction(previous=>({kind:actions[event.key],serial:(previous?.serial??0)+1}));}
    if(event.key==='Escape') setSelected(null);
    if(event.key==='Enter') {event.preventDefault();setSelected(PERSONAS[(PERSONAS.findIndex(p=>p.id===selected)+1)%PERSONAS.length].id);}
  }
  return <main className="fixed inset-0 isolate overflow-hidden bg-[#d7c39d] text-stone-200">
    <section tabIndex={0} onKeyDown={onKeyDown} aria-label="Peta kota 3D" aria-describedby="map-help" className="absolute inset-0 touch-none focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-amber-100">
      <OfficeScene agents={[]} selected={selected} onSelect={setSelected} cameraAction={cameraAction}/>
    </section>
    <h1 className="pointer-events-none absolute left-4 top-4 text-lg font-semibold text-white drop-shadow-lg">Jesus-Office</h1>
    <p id="map-help" className="sr-only">Geser atau gunakan tombol panah untuk menjelajah. Scroll, cubit, plus atau minus untuk zoom. Nol mereset kamera. Enter memilih role berikutnya, Escape menutup role.</p>
    {persona && <p role="status" className="pointer-events-none absolute bottom-10 left-4 rounded bg-black/60 px-3 py-2 text-sm text-white">{persona.role}</p>}
    <p className="pointer-events-none absolute bottom-3 left-4 right-4 text-[11px] text-white drop-shadow-[0_1px_2px_black]">Simulasi visual tim · bukan aktivitas agent live</p>
  </main>;
}
