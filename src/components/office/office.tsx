"use client";

import dynamic from "next/dynamic";
import { useState, type KeyboardEvent } from "react";
import { PERSONAS } from "@/lib/personas";
import { useSnapshot } from "@/lib/use-snapshot";

const OfficeScene = dynamic(() => import("./scene"), { ssr: false, loading: () => null });
type Direction = "zoom-in" | "zoom-out" | "reset" | "north" | "south" | "east" | "west";

export function Office() {
  const { snapshot, error } = useSnapshot();
  const agents = !error && snapshot?.available ? snapshot.agents : [];
  const [selected, setSelected] = useState<string | null>(null);
  const [cameraAction, setCameraAction] = useState<{kind:Direction;serial:number}>();
  function onKeyDown(event:KeyboardEvent<HTMLElement>) {
    const actions:Record<string,Direction>={ArrowUp:'north',ArrowDown:'south',ArrowLeft:'west',ArrowRight:'east','+':'zoom-in','=':'zoom-in','-':'zoom-out','0':'reset'};
    if (actions[event.key]) {event.preventDefault();setCameraAction(previous=>({kind:actions[event.key],serial:(previous?.serial??0)+1}));}
    if(event.key==='Escape') setSelected(null);
    if(event.key==='Enter') {event.preventDefault();setSelected(PERSONAS[(PERSONAS.findIndex(p=>p.id===selected)+1)%PERSONAS.length].id);}
  }
  return <main className="fixed inset-0 isolate overflow-hidden bg-[#d7c39d]">
    <section tabIndex={0} onKeyDown={onKeyDown} aria-label="Peta kota 3D"
      className="absolute inset-0 touch-none focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-amber-100">
      <OfficeScene agents={agents} selected={selected} onSelect={setSelected} cameraAction={cameraAction}/>
    </section>
  </main>;
}
