import { useState } from 'react';
import { useClipboard } from '@mantine/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DropZone from '@/components/shared/DropZone';
import { useToolVisit } from '@/stores/toolVisit';
import { hashText, hashFile } from '@/lib/dev/hashGenerator';
import { CopyIcon, CheckIcon, HashIcon } from '@phosphor-icons/react';

interface Hashes {
  sha256: string;
  sha512: string;
}

function CopyButton({ value }: { value: string }) {
  const clipboard = useClipboard({ timeout: 2000 });
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => clipboard.copy(value)}
      className="h-7 px-2 text-xs gap-1.5 shrink-0"
    >
      {clipboard.copied
        ? <><CheckIcon className="size-3 text-green-500" /> Copied</>
        : <><CopyIcon className="size-3" /> Copy</>}
    </Button>
  );
}

function HashTable({ hashes }: { hashes: Hashes }) {
  const rows = [
    { label: 'SHA-256', value: hashes.sha256 },
    { label: 'SHA-512', value: hashes.sha512 },
  ];
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {rows.map((row, i) => (
        <div key={row.label} className={`p-3 ${i > 0 ? 'border-t border-border' : ''}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{row.label}</span>
            <CopyButton value={row.value} />
          </div>
          <p className="text-xs font-mono break-all text-foreground">{row.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function HashGeneratorTool() {
  useToolVisit('dev', '/dev/hash-generator');

  const [textInput, setTextInput] = useState('');
  const [textHashes, setTextHashes] = useState<Hashes | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [fileHashes, setFileHashes] = useState<Hashes | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  async function handleTextHash() {
    if (!textInput.trim()) return;
    setTextLoading(true);
    try {
      const result = await hashText(textInput);
      setTextHashes(result);
    } finally {
      setTextLoading(false);
    }
  }

  async function handleFile(files: File[]) {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setFileHashes(null);
    setFileLoading(true);
    try {
      const result = await hashFile(f);
      setFileHashes(result);
    } finally {
      setFileLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="text">
        <TabsList>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="file">File</TabsTrigger>
        </TabsList>

        {/* Text tab */}
        <TabsContent value="text" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-5 pb-4 space-y-3">
              <Label htmlFor="hash-text-input">Input Text</Label>
              <Textarea
                id="hash-text-input"
                rows={5}
                value={textInput}
                onChange={e => { setTextInput(e.target.value); setTextHashes(null); }}
                placeholder="Enter text to hash…"
                className="resize-none font-mono"
              />
              <Button onClick={handleTextHash} disabled={!textInput.trim() || textLoading} className="gap-2">
                <HashIcon className="size-4" />
                {textLoading ? 'Generating…' : 'Generate Hashes'}
              </Button>
            </CardContent>
          </Card>

          {textHashes && (
            <Card>
              <CardContent className="pt-5 pb-4 space-y-3">
                <p className="text-sm font-semibold text-foreground">Hashes</p>
                <HashTable hashes={textHashes} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* File tab */}
        <TabsContent value="file" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-5 pb-4 space-y-3">
              <DropZone
                onFiles={handleFile}
                multiple={false}
                label="Drop any file here"
                sublabel="SHA-256 and SHA-512 will be generated"
              />
              {file && (
                <p className="text-sm text-muted-foreground">
                  File: <span className="font-mono font-medium text-foreground">{file.name}</span>
                  {' · '}
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              )}
              {fileLoading && (
                <p className="text-sm text-muted-foreground">Computing hashes…</p>
              )}
            </CardContent>
          </Card>

          {fileHashes && (
            <Card>
              <CardContent className="pt-5 pb-4 space-y-3">
                <p className="text-sm font-semibold text-foreground">Hashes</p>
                <HashTable hashes={fileHashes} />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
