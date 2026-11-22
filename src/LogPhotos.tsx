import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { usePhotoUrl } from "./useCover";
import type { StoredPhoto } from "./types";

function PhotoImage({ id, draft, full = false }: { id: string; draft?: StoredPhoto; full?: boolean }) {
  const savedUrl = usePhotoUrl(draft ? null : id, full ? "full" : "thumb");
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!draft) { setDraftUrl(null); return; }
    const url = URL.createObjectURL(full ? draft.blob : draft.thumb ?? draft.blob);
    setDraftUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draft, full]);
  const url = draft ? draftUrl : savedUrl;
  return url ? <img src={url} alt="" className={full ? "cover-viewer-image" : "log-photo-image"} /> : <span className="muted small">写真を読み込めません</span>;
}

/** 記録の写真。入力時には削除ボタンを出し、読む画面では拡大できる。 */
export function LogPhotos({ ids, drafts = [], onRemove, onOpenPhoto }: { ids: string[]; drafts?: StoredPhoto[]; onRemove?: (id: string) => void; onOpenPhoto?: (id: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!openId) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenId(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [openId]);
  if (ids.length === 0) return null;
  const draftOf = (id: string) => drafts.find((p) => p.id === id);
  return <>
    <div className="log-photo-grid">
      {ids.map((id, index) => <div className="log-photo-tile" key={id}>
        <button type="button" className="log-photo-button" aria-label={`写真${index + 1}を${onOpenPhoto ? "記録で開く" : "拡大"}`} onClick={() => onOpenPhoto ? onOpenPhoto(id) : setOpenId(id)}><PhotoImage id={id} draft={draftOf(id)} /></button>
        {onRemove && <button type="button" className="log-photo-remove" aria-label={`写真${index + 1}を外す`} onClick={() => onRemove(id)}><Icon name="close" size={16} /></button>}
      </div>)}
    </div>
    {openId && <div className="cover-viewer" role="dialog" aria-modal="true" aria-label="写真を拡大" onClick={() => setOpenId(null)}>
      <PhotoImage id={openId} draft={draftOf(openId)} full />
      <button type="button" className="cover-viewer-close" aria-label="写真を閉じる" onClick={() => setOpenId(null)}><Icon name="close" size={24} /></button>
    </div>}
  </>;
}
