import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { uploadImage } from "~/lib/upload";
import { cn } from "~/lib/cn";

/** Photo grid with drag-and-drop upload. First image is the cover; click a photo to make it the cover. */
export function ImagePicker({ value, onChange, max = 8 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);

  async function add(files: FileList | File[]) {
    const list = [...files].filter((f) => f.type.startsWith("image/")).slice(0, max - value.length);
    if (!list.length) return;
    setUploading(list.length);
    const urls: string[] = [];
    for (const f of list) {
      try {
        urls.push(await uploadImage(f));
      } catch (e: any) {
        toast.error(`${f.name}: ${e.message}`);
      }
      setUploading((n) => n - 1);
    }
    onChange([...value, ...urls]);
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn("grid grid-cols-4 gap-2 rounded-xl transition-[outline-color] sm:grid-cols-5", over && "outline-2 outline-dashed outline-accent outline-offset-4")}
    >
      {value.map((url, i) => (
        <div key={url} className="group relative aspect-square">
          <button
            type="button"
            onClick={() => i > 0 && onChange([url, ...value.filter((u) => u !== url)])}
            className="block size-full overflow-hidden rounded-lg border border-border bg-surface-2"
            aria-label={i === 0 ? "Cover photo" : "Make cover photo"}
            title={i === 0 ? "Cover photo" : "Make cover"}
          >
            <img src={url} alt="" className="size-full object-cover" />
          </button>
          {i === 0 && <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-medium text-white">Cover</span>}
          <button
            type="button"
            onClick={() => onChange(value.filter((u) => u !== url))}
            className="pressable absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-border bg-surface text-fg-2 shadow-sm hover:text-bad"
            aria-label="Remove photo"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {Array.from({ length: uploading }).map((_, i) => (
        <div key={`u${i}`} className="grid aspect-square place-items-center rounded-lg border border-border bg-surface-2">
          <Loader2 className="size-5 animate-spin text-fg-3" aria-label="Uploading" />
        </div>
      ))}
      {value.length + uploading < max && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="pressable grid aspect-square place-items-center rounded-lg border border-dashed border-border-strong text-fg-3 hover:border-accent hover:text-link"
        >
          <span className="grid place-items-center gap-1 text-xs">
            <ImagePlus className="size-5" aria-hidden />
            Add photo
          </span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) add(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
