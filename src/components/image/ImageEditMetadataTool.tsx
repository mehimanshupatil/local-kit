import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { embedMetadata } from '@/lib/image/imageEditMetadata';
import { formatFileSize, stripExtension } from '@/lib/utils/fileUtils';
import { useToolVisit } from '@/stores/toolVisit';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';

interface FormState {
  description: string;
  artist: string;
  copyright: string;
  software: string;
  dateTime: string;
  lat: string;
  lng: string;
}

const EMPTY_FORM: FormState = {
  description: '',
  artist: '',
  copyright: '',
  software: '',
  dateTime: '',
  lat: '',
  lng: '',
};

export default function ImageEditMetadataTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('image', '/image/edit-metadata');
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;

  const handleFiles = (incoming: File[]) => {
    const f = incoming[0];
    if (!f) return;
    setFile(f);
    setSessionFiles([f]);
    updateOp(() => ({ ...IDLE_OP }));
  };

  // Seed from session on mount
  useEffect(() => {
    if (sessionFiles.length > 0 && !file) { handleFiles([sessionFiles[0]]); }
  }, []);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleEmbed = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      // Convert datetime-local value ("YYYY-MM-DDTHH:MM") to EXIF format ("YYYY:MM:DD HH:MM:SS")
      let dateTime: string | undefined;
      if (form.dateTime) {
        const [datePart, timePart] = form.dateTime.split('T');
        const exifDate = datePart.replace(/-/g, ':');
        dateTime = `${exifDate} ${timePart ?? '00:00'}:00`;
      }

      const lat = form.lat !== '' ? parseFloat(form.lat) : undefined;
      const lng = form.lng !== '' ? parseFloat(form.lng) : undefined;

      const blob = await embedMetadata(
        file,
        {
          description: form.description || undefined,
          artist: form.artist || undefined,
          copyright: form.copyright || undefined,
          software: form.software || undefined,
          dateTime,
          gps: lat !== undefined && lng !== undefined ? { lat, lng } : undefined,
        },
        (pct) => updateOp(d => { d.progress = pct; }),
      );

      const name = `${stripExtension(file.name)}_meta.jpg`;
      updateOp(d => { d.output = [{ name, blob, size: blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Failed to embed metadata'; d.status = 'error'; });
    }
  };

  const reset = () => {
    setFile(null);
    setForm(EMPTY_FORM);
    updateOp(() => ({ ...IDLE_OP }));
    clearSession();
  };

  return (
    <div className="space-y-5">
      <DropZone
        onFiles={handleFiles}
        accept="image/jpeg,image/jpg"
        multiple={false}
        label="Drop a JPEG image here"
        sublabel="JPEG / JPG only — metadata embedding requires JPEG format"
      />

      {file && (
        <Card className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground text-sm truncate max-w-xs">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(file.size)}</p>
            </div>
            <Button variant="secondary" onClick={reset} className="text-xs">Clear</Button>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">EXIF Fields (all optional)</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  className="w-full"
                  type="text"
                  placeholder="Photo description"
                  value={form.description}
                  onChange={set('description')}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="artist">Artist / Author</Label>
                <Input
                  id="artist"
                  className="w-full"
                  type="text"
                  placeholder="Photographer name"
                  value={form.artist}
                  onChange={set('artist')}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="copyright">Copyright</Label>
                <Input
                  id="copyright"
                  className="w-full"
                  type="text"
                  placeholder="© 2024 Your Name"
                  value={form.copyright}
                  onChange={set('copyright')}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="software">Software</Label>
                <Input
                  id="software"
                  className="w-full"
                  type="text"
                  placeholder="e.g. Adobe Lightroom"
                  value={form.software}
                  onChange={set('software')}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="dateTime">Date / Time</Label>
                <Input
                  id="dateTime"
                  className="w-full"
                  type="datetime-local"
                  value={form.dateTime}
                  onChange={set('dateTime')}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">GPS Coordinates</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="lat">Latitude</Label>
                  <Input
                    id="lat"
                    className="w-full"
                    type="number"
                    min={-90}
                    max={90}
                    step={0.000001}
                    placeholder="e.g. 37.774929"
                    value={form.lat}
                    onChange={set('lat')}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lng">Longitude</Label>
                  <Input
                    id="lng"
                    className="w-full"
                    type="number"
                    min={-180}
                    max={180}
                    step={0.000001}
                    placeholder="e.g. -122.419416"
                    value={form.lng}
                    onChange={set('lng')}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: right-click any location in Google Maps to copy coordinates
              </p>
            </div>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Embedding metadata…" />}
          {status === 'error' && (
            <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>
          )}

          <div className="flex gap-3">
            <Button onClick={handleEmbed} disabled={status === 'processing'}>
              {status === 'processing' ? 'Embedding…' : 'Embed Metadata'}
            </Button>
            <Button variant="secondary" onClick={reset}>Reset</Button>
          </div>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
