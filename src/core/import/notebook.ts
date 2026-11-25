/**
 * Reading a photo of the caretaker's notebook. The real implementation will
 * call an AI vision API and return rows in the same shape as a pasted list, so
 * the agent corrects them on the same preview screen. Stubbed for now.
 */
export interface NotebookReader {
  /** Returns rows of cells (unit, name, phone, rent, balance… in any order). */
  read(image: { bytes: Uint8Array; mimeType: string }): Promise<string[][]>;
}

export class NotebookReaderNotConfigured extends Error {
  constructor() {
    super("Reading notebook photos isn't switched on yet. Type or paste the list instead.");
  }
}

export const stubNotebookReader: NotebookReader = {
  async read() {
    throw new NotebookReaderNotConfigured();
  },
};
