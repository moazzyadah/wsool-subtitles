/**
 * Word-level diff using the classic LCS algorithm. Produces a per-word
 * status array per side. Used by CompareView to highlight which words
 * differ between two transcripts.
 *
 * Tokenization respects Unicode word boundaries — works for Arabic + Latin.
 */

export type DiffOp = 'eq' | 'add' | 'del';

export interface DiffToken {
  text: string;
  op: DiffOp;
}

const WORD_REGEX = /[\p{L}\p{N}']+|[^\s\p{L}\p{N}']+/gu;

function tokenize(s: string): string[] {
  return s.match(WORD_REGEX) ?? [];
}

function normalizeForCompare(s: string): string {
  return s.toLowerCase().normalize('NFKC');
}

interface LcsCell {
  len: number;
  back: 0 | 1 | 2; // 0 = diag (match), 1 = up (del from a), 2 = left (add from b)
}

function lcsTable(a: string[], b: string[]): LcsCell[][] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: LcsCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ len: 0, back: 0 as const }))
  );

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const ai = a[i - 1]!;
      const bj = b[j - 1]!;
      if (normalizeForCompare(ai) === normalizeForCompare(bj)) {
        const prev = table[i - 1]![j - 1]!.len;
        table[i]![j] = { len: prev + 1, back: 0 };
      } else {
        const up = table[i - 1]![j]!.len;
        const left = table[i]![j - 1]!.len;
        if (up >= left) table[i]![j] = { len: up, back: 1 };
        else table[i]![j] = { len: left, back: 2 };
      }
    }
  }
  return table;
}

/** Returns two parallel arrays — one per input — with op tags per token. */
export function diffWords(a: string, b: string): { left: DiffToken[]; right: DiffToken[] } {
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  const table = lcsTable(tokA, tokB);

  const left: DiffToken[] = [];
  const right: DiffToken[] = [];

  let i = tokA.length;
  let j = tokB.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && table[i]![j]!.back === 0) {
      left.unshift({ text: tokA[i - 1]!, op: 'eq' });
      right.unshift({ text: tokB[j - 1]!, op: 'eq' });
      i--; j--;
    } else if (i > 0 && (j === 0 || table[i]![j]!.back === 1)) {
      left.unshift({ text: tokA[i - 1]!, op: 'del' });
      i--;
    } else {
      right.unshift({ text: tokB[j - 1]!, op: 'add' });
      j--;
    }
  }
  return { left, right };
}

/** % of tokens shared (case-insensitive). 1.0 = identical text. */
export function similarity(a: string, b: string): number {
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  if (tokA.length === 0 && tokB.length === 0) return 1;
  const lcs = lcsTable(tokA, tokB);
  const matches = lcs[tokA.length]![tokB.length]!.len;
  return (2 * matches) / (tokA.length + tokB.length);
}
