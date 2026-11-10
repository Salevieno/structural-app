use serde::Deserialize;
use serde_json::Value;

pub const BACKEND_DIAGNOSTIC_RESPONSE: &str = "structural-app-backend-ready";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisRequest {
    contract_version: u32,
    analysis_id: String,
    model: Value,
}

#[tauri::command]
fn backend_diagnostic() -> &'static str {
    BACKEND_DIAGNOSTIC_RESPONSE
}

#[tauri::command]
fn run_analysis(request: AnalysisRequest) -> Result<Value, String> {
    if request.contract_version != 1 {
        return Err(format!(
            "Versão de contrato não suportada: {}.",
            request.contract_version
        ));
    }
    if request.analysis_id.trim().is_empty() {
        return Err("O identificador da análise não pode estar vazio.".to_string());
    }

    let _model = request.model;
    Err(
        "O solver estrutural ainda não está implementado; nenhum resultado foi calculado."
            .to_string(),
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![backend_diagnostic, run_analysis])
        .run(tauri::generate_context!())
        .expect("Erro ao executar aplicação Tauri");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostic_returns_the_expected_marker() {
        assert_eq!(backend_diagnostic(), BACKEND_DIAGNOSTIC_RESPONSE);
    }

    #[test]
    fn analysis_rejects_unsupported_contract_versions() {
        let request = AnalysisRequest {
            contract_version: 2,
            analysis_id: "analysis-1".to_string(),
            model: Value::Null,
        };
        assert!(run_analysis(request).unwrap_err().contains("não suportada"));
    }

    #[test]
    fn analysis_never_returns_fabricated_results() {
        let request = AnalysisRequest {
            contract_version: 1,
            analysis_id: "analysis-1".to_string(),
            model: Value::Null,
        };
        assert!(run_analysis(request)
            .unwrap_err()
            .contains("nenhum resultado foi calculado"));
    }
}
