/* tslint:disable */
/* eslint-disable */

export class MathCAT {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Parse input in `code` and return plain MathML (`<math>…</math>`, no MathCAT ids).
     * Does not change the current expression. This is the string to paste into an editor.
     * Input is run through `normalizeBrailleInput` first.
     */
    static brailleToMathML(input: string, code: string): string;
    /**
     * Codes the parser accepts as input: "UEB", "Nemeth", "ASCIIMath", "LaTeX".
     */
    static getBrailleInputCodes(): string[];
    static getBraille(nav_node_id: string): string;
    static getPreference(name: string): string;
    static getSpokenText(): string;
    /**
     * Braille codes MathCAT can produce (output side).
     */
    static getSupportedBrailleCodes(): string[];
    /**
     * Speech languages available in the rules.
     */
    static getSupportedLanguages(): string[];
    static getVersion(): string;
    /**
     * Clean up typed input before parsing (same rules as the MathCAT demo):
     * - UEB / Nemeth: North American ASCII braille is mapped to Unicode braille cells.
     * - ASCIIMath / LaTeX: 6- or 8-dot computer-braille cells are mapped back to text.
     * - Spaces next to Unicode braille become the blank cell U+2800.
     */
    static normalizeBrailleInput(input: string, code: string): string;
    /**
     * Parse input in `code` and make it the current expression (like `setMathML`),
     * so `getSpokenText` / `getBraille` work on it. Returns the canonical MathML (with ids).
     * Input is run through `normalizeBrailleInput` first.
     */
    static setMathMLFromBraille(input: string, code: string): string;
    static setMathML(mathml_str: string): string;
    static setPreference(name: string, value: string): void;
    static setRulesDir(dir: string): void;
    /**
     * Back-translate `input` from `from_code` and re-braille it in `to_code`
     * (e.g. Nemeth -> UEB). The `BrailleCode` preference is restored afterwards.
     */
    static translateBraille(input: string, from_code: string, to_code: string): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_mathcat_free: (a: number, b: number) => void;
    readonly mathcat_brailleToMathML: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly mathcat_getBraille: (a: number, b: number) => [number, number, number, number];
    readonly mathcat_getBrailleInputCodes: () => [number, number];
    readonly mathcat_getPreference: (a: number, b: number) => [number, number, number, number];
    readonly mathcat_getSpokenText: () => [number, number, number, number];
    readonly mathcat_getSupportedBrailleCodes: () => [number, number, number, number];
    readonly mathcat_getSupportedLanguages: () => [number, number, number, number];
    readonly mathcat_getVersion: () => [number, number];
    readonly mathcat_normalizeBrailleInput: (a: number, b: number, c: number, d: number) => [number, number];
    readonly mathcat_setMathML: (a: number, b: number) => [number, number, number, number];
    readonly mathcat_setMathMLFromBraille: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly mathcat_setPreference: (a: number, b: number, c: number, d: number) => [number, number];
    readonly mathcat_setRulesDir: (a: number, b: number) => [number, number];
    readonly mathcat_translateBraille: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
