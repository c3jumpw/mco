// Pictures used in lessons. "media:<id>" pictures are stored in RAMP (ramp_media, private to the workspace);
// anything else is used as a normal link. Uploads are shrunk and converted to WebP in the browser first.
import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { supabase } from '../lib/supabase';
import { cx } from '../lib/util';

const cache = new Map<string, Promise<string>>();

function load(id: string): Promise<string> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase.from('ramp_media').select('mime,data').eq('id', id).maybeSingle();
      if (error || !data) throw new Error(error?.message || 'Picture not found');
      const row = data as { mime: string; data: string };
      return `data:${row.mime};base64,${row.data}`;
    })();
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** The URL to show for a lesson picture, or null while it loads. */
export function useMedia(src: string | undefined): { url: string | null; failed: boolean } {
  const id = src?.startsWith('media:') ? src.slice(6) : null;
  const [state, setState] = useState<{ url: string | null; failed: boolean }>(() => ({ url: id ? null : src || null, failed: false }));
  useEffect(() => {
    if (!id) { setState({ url: src || null, failed: false }); return; }
    let live = true;
    setState({ url: null, failed: false });
    load(id).then((url) => live && setState({ url, failed: false }), () => live && setState({ url: null, failed: true }));
    return () => { live = false; };
  }, [id, src]);
  return state;
}

export function MediaImg({ src, alt, className, ...rest }: { src: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const { url, failed } = useMedia(src);
  if (failed) return <div className={cx('flex items-center justify-center bg-chip text-muted text-sm rounded-xl min-h-32', className)} role="img" aria-label={alt}>Picture unavailable</div>;
  if (!url) return <div className={cx('skeleton min-h-40 rounded-xl', className)} aria-hidden="true" />;
  return <img src={url} alt={alt} className={className} draggable={false} {...rest} />;
}

/** Shrink a picture to at most `max` pixels wide, save it to RAMP and return its "media:<id>" source. */
export async function uploadMedia(file: File, max = 1600): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / bitmap.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  c.getContext('2d')!.drawImage(bitmap, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/webp', 0.84);
  const b64 = dataUrl.split(',')[1] || '';
  if (b64.length > 1_900_000) throw new Error('That picture is too large. Try a smaller one.');
  const { data, error } = await supabase.from('ramp_media')
    .insert({ name: file.name.slice(0, 200), mime: 'image/webp', data: b64, width: c.width, height: c.height })
    .select('id').single();
  if (error) throw new Error(error.message);
  return `media:${(data as { id: string }).id}`;
}
