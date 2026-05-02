import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList } from '@cantoo/pdf-lib';

export type FieldType = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'optionlist' | 'unknown';

export interface FormField {
  name: string;
  type: FieldType;
  value: string | boolean;
  options?: string[];    // for dropdown/radio/optionlist
  multiline?: boolean;   // for text
  readOnly: boolean;
  required: boolean;
}

export async function loadFormFields(buffer: ArrayBuffer): Promise<FormField[]> {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  return fields.map(field => {
    const name = field.getName();
    const readOnly = field.isReadOnly();
    const required = field.isRequired();

    if (field instanceof PDFTextField) {
      return { name, type: 'text', value: field.getText() ?? '', multiline: field.isMultiline(), readOnly, required };
    }
    if (field instanceof PDFCheckBox) {
      return { name, type: 'checkbox', value: field.isChecked(), readOnly, required };
    }
    if (field instanceof PDFDropdown) {
      return { name, type: 'dropdown', value: field.getSelected()[0] ?? '', options: field.getOptions(), readOnly, required };
    }
    if (field instanceof PDFRadioGroup) {
      return { name, type: 'radio', value: field.getSelected() ?? '', options: field.getOptions(), readOnly, required };
    }
    if (field instanceof PDFOptionList) {
      return { name, type: 'optionlist', value: field.getSelected()[0] ?? '', options: field.getOptions(), readOnly, required };
    }
    return { name, type: 'unknown', value: '', readOnly, required };
  });
}

export async function fillAndFlattenForm(
  buffer: ArrayBuffer,
  values: Record<string, string | boolean>,
  flatten: boolean,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  onProgress?.(10);
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  onProgress?.(30);
  const fields = form.getFields();
  for (const field of fields) {
    const name = field.getName();
    if (!(name in values)) continue;
    const val = values[name];

    if (field instanceof PDFTextField) {
      field.setText(typeof val === 'string' ? val : String(val));
    } else if (field instanceof PDFCheckBox) {
      val ? field.check() : field.uncheck();
    } else if (field instanceof PDFDropdown) {
      if (typeof val === 'string' && val) field.select(val);
    } else if (field instanceof PDFRadioGroup) {
      if (typeof val === 'string' && val) field.select(val);
    } else if (field instanceof PDFOptionList) {
      if (typeof val === 'string' && val) field.select(val);
    }
  }

  onProgress?.(70);
  if (flatten) form.flatten();

  onProgress?.(90);
  const bytes = await pdfDoc.save();
  onProgress?.(100);
  return new Blob([bytes], { type: 'application/pdf' });
}
