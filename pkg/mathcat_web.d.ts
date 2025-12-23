/* tslint:disable */
/* eslint-disable */
export class MathCAT {
  private constructor();
  free(): void;
  static getBraille(nav_node_id: string): string;
  static getVersion(): string;
  static setRulesDir(dir: string): void;
  static getPreference(name: string): string;
  static getSpokenText(): string;
  static setPreference(name: string, value: string): void;
  static setMathML(mathml_str: string): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_mathcat_free: (a: number, b: number) => void;
  readonly mathcat_getBraille: (a: number, b: number) => [number, number, number, number];
  readonly mathcat_getPreference: (a: number, b: number) => [number, number, number, number];
  readonly mathcat_getSpokenText: () => [number, number, number, number];
  readonly mathcat_getVersion: () => [number, number];
  readonly mathcat_setMathML: (a: number, b: number) => [number, number, number, number];
  readonly mathcat_setPreference: (a: number, b: number, c: number, d: number) => [number, number];
  readonly mathcat_setRulesDir: (a: number, b: number) => [number, number];
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export_3: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
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
