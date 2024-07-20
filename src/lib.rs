use wasm_bindgen::prelude::*;
use libmathcat::*;

#[wasm_bindgen]
pub struct MathCAT;

#[wasm_bindgen]
#[allow(non_snake_case)]
  impl MathCAT {
    pub fn setRulesDir(dir: String) -> Result<(), JsValue> {
      set_rules_dir(dir).map_err(|e| JsValue::from_str(&e.to_string()))
  }

  pub fn getVersion() -> String {
      get_version()
  }

  pub fn setPreference(name: String, value: String) -> Result<(), JsValue> {
      set_preference(name, value).map_err(|e| JsValue::from_str(&e.to_string()))
  }

  pub fn setMathML(mathml_str: String) -> Result<String, JsValue> {
      set_mathml(mathml_str).map_err(|e| JsValue::from_str(&e.to_string()))
  }

  pub fn getSpokenText() -> Result<String, JsValue> {
      get_spoken_text().map_err(|e| JsValue::from_str(&e.to_string()))
  }

  pub fn getBraille(nav_node_id: String) -> Result<String, JsValue> {
      get_braille(nav_node_id).map_err(|e| JsValue::from_str(&e.to_string()))
  }
}
