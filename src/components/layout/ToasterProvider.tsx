import { Toaster } from 'sonner';

export default function ToasterProvider() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        style: { fontFamily: 'Inter, system-ui, sans-serif' },
      }}
    />
  );
}
