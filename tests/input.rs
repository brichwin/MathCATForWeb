// Native smoke test: `cargo test -- --nocapture` (needs ../MathCAT on braille-parser).
// JsValue errors can't be created off-wasm, so this calls only success paths.
use mathcat_web::MathCAT;

#[test]
fn input_round_trip() {
    MathCAT::setRulesDir("Rules".into()).unwrap();
    println!("version {}", MathCAT::getVersion());
    let cases = [
        ("Nemeth", "⠹⠁⠌⠃⠼"),          // a/b
        ("Nemeth", "?A/B#"),           // same, ASCII braille
        ("Nemeth", "X^2\"+3"),         // x^2 + 3
        ("UEB", "⠰⠰⠭⠰⠔⠼⠃⠐⠖⠼⠉"),       // x^2+3
        ("ASCIIMath", "x^2 + sqrt(y)"),
        ("LaTeX", r"\frac{a}{b}+x^2"),
    ];
    for (code, input) in cases {
        let norm = MathCAT::normalizeBrailleInput(input.into(), code.into());
        let mml = MathCAT::brailleToMathML(input.into(), code.into()).unwrap();
        MathCAT::setMathMLFromBraille(input.into(), code.into()).unwrap();
        let speech = MathCAT::getSpokenText().unwrap();
        let ueb = MathCAT::translateBraille(input.into(), code.into(), "UEB".into()).unwrap();
        let nem = MathCAT::translateBraille(input.into(), code.into(), "Nemeth".into()).unwrap();
        println!("\n[{code}] {input}  (normalized: {norm})\n  MathML: {mml}\n  speech: {speech}\n  UEB: {ueb}   Nemeth: {nem}");
    }
}
