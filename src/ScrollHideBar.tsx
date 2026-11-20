// 上部の切り替え（タブ・種類のチップ）を一覧の上に貼り付け、下へスクロールすると隠し、上へスクロールすると出す（v0.20.0）
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { THRESHOLD, TOP_ZONE, nextHidden } from "./scrollLogic";

export function ScrollHideBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const scroller = ref.current?.closest(".content");
    if (!(scroller instanceof HTMLElement)) return;
    let last = scroller.scrollTop;
    let current = false;
    const onScroll = () => {
      const top = scroller.scrollTop;
      // 比べる値はその場で決める（setState の更新関数は後で動くことがあり、last が先に変わってしまうため）
      const next = nextHidden(current, last, top);
      if (next !== current) {
        current = next;
        setHidden(next);
      }
      if (Math.abs(top - last) > THRESHOLD || top <= TOP_ZONE) last = top;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div ref={ref} className={`scroll-hide-bar${hidden ? " is-hidden" : ""}`}>
      {children}
    </div>
  );
}
