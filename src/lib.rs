extern crate console_error_panic_hook;
use wasm_bindgen::prelude::*;
use libmathcat::*;

mod braille_input;

fn js_err(e: libmathcat::errors::Error) -> JsValue {
    JsValue::from_str(&errors_to_string(&e))
}

#[wasm_bindgen]
pub struct MathCAT;

#[wasm_bindgen]
#[allow(non_snake_case)]
impl MathCAT {
    pub fn setRulesDir(dir: String) -> Result<(), JsValue> {
        console_error_panic_hook::set_once();
        set_rules_dir(dir).map_err(js_err)
    }

    pub fn getVersion() -> String {
        get_version()
    }

    pub fn setPreference(name: String, value: String) -> Result<(), JsValue> {
        set_preference(name, value).map_err(js_err)
    }

    pub fn getPreference(name: String) -> Result<String, JsValue> {
        get_preference(name).map_err(js_err)
    }

    pub fn setMathML(mathml_str: String) -> Result<String, JsValue> {
        set_mathml(mathml_str).map_err(js_err)
    }

    pub fn getSpokenText() -> Result<String, JsValue> {
        get_spoken_text().map_err(js_err)
    }

    pub fn getBraille(nav_node_id: String) -> Result<String, JsValue> {
        get_braille(nav_node_id).map_err(js_err)
    }

    /// Braille codes MathCAT can produce (output side).
    pub fn getSupportedBrailleCodes() -> Result<Vec<String>, JsValue> {
        get_supported_braille_codes().map_err(js_err)
    }

    /// Speech languages available in the rules.
    pub fn getSupportedLanguages() -> Result<Vec<String>, JsValue> {
        get_supported_languages().map_err(js_err)
    }

    // ---------- Input (braille / ASCIIMath / LaTeX -> MathML) ----------
    // Requires MathCAT built from the `braille-parser` branch (0.8.0-alpha.x).

    /// Codes the parser accepts as input: "UEB", "Nemeth", "ASCIIMath", "LaTeX".
    pub fn getBrailleInputCodes() -> Vec<String> {
        braille_input::INPUT_CODES.iter().map(|s| s.to_string()).collect()
    }

    /// Clean up typed input before parsing (same rules as the MathCAT demo):
    /// - UEB / Nemeth: North American ASCII braille is mapped to Unicode braille cells.
    /// - ASCIIMath / LaTeX: 6- or 8-dot computer-braille cells are mapped back to text.
    /// - Spaces next to Unicode braille become the blank cell U+2800.
    pub fn normalizeBrailleInput(input: String, code: String) -> String {
        braille_input::braille_input_text(&input, &code)
    }

    /// Parse input in `code` and return plain MathML (`<math>…</math>`, no MathCAT ids).
    /// Does not change the current expression. This is the string to paste into an editor.
    /// Input is run through `normalizeBrailleInput` first.
    pub fn brailleToMathML(input: String, code: String) -> Result<String, JsValue> {
        console_error_panic_hook::set_once();
        let text = braille_input::braille_input_text(&input, &code);
        libmathcat::parser::Braille_to_MathML(&text, &code).map_err(js_err)
    }

    /// Parse input in `code` and make it the current expression (like `setMathML`),
    /// so `getSpokenText` / `getBraille` work on it. Returns the canonical MathML (with ids).
    /// Input is run through `normalizeBrailleInput` first.
    pub fn setMathMLFromBraille(input: String, code: String) -> Result<String, JsValue> {
        console_error_panic_hook::set_once();
        let text = braille_input::braille_input_text(&input, &code);
        set_mathml_from_braille(text, &code).map_err(js_err)
    }

    /// Back-translate `input` from `from_code` and re-braille it in `to_code`
    /// (e.g. Nemeth -> UEB). The `BrailleCode` preference is restored afterwards.
    pub fn translateBraille(input: String, from_code: String, to_code: String) -> Result<String, JsValue> {
        let saved = get_preference("BrailleCode").ok();
        let result = (|| {
            MathCAT::setMathMLFromBraille(input, from_code)?;
            set_preference("BrailleCode", &to_code).map_err(js_err)?;
            get_braille("").map_err(js_err)
        })();
        if let Some(code) = saved {
            let _ = set_preference("BrailleCode", code);
        }
        result
    }
}
