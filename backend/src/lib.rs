use serde::Deserialize;
use serde_json::{json, Value};

pub const BACKEND_DIAGNOSTIC_RESPONSE: &str = "structural-app-backend-ready";
const MOCK_RESULTS: &str = include_str!("../../frontend/docs/structural-results-example.json");

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

    let nodes = request
        .model
        .get("nodes")
        .and_then(Value::as_array)
        .ok_or_else(|| "O modelo deve conter uma lista de nós.".to_string())?;

    let mut node_ids = std::collections::HashSet::with_capacity(nodes.len());
    for (index, node) in nodes.iter().enumerate() {
        let node_id = node
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.trim().is_empty())
            .ok_or_else(|| format!("O nó na posição {index} deve ter um identificador válido."))?;
        if !node_ids.insert(node_id) {
            return Err(format!("O identificador de nó '{node_id}' está duplicado."));
        }

        let position = node
            .get("position")
            .and_then(Value::as_object)
            .ok_or_else(|| format!("O nó '{node_id}' deve ter uma posição válida."))?;
        for axis in ["x", "y", "z"] {
            if !position
                .get(axis)
                .and_then(Value::as_f64)
                .is_some_and(f64::is_finite)
            {
                return Err(format!(
                    "A coordenada '{axis}' do nó '{node_id}' deve ser um número finito."
                ));
            }
        }
    }

    let mut results: Value = serde_json::from_str(MOCK_RESULTS)
        .map_err(|error| format!("Não foi possível carregar o resultado mock: {error}"))?;
    let mock_displacements = results["displacements"]
        .as_array()
        .ok_or_else(|| "A lista de deslocamentos do resultado mock é inválida.".to_string())?;

    let result_nodes: Vec<Value> = nodes
        .iter()
        .map(|node| {
            json!({
                "nodeId": node["id"],
                "position": node["position"],
            })
        })
        .collect();
    let displacements: Vec<Value> = nodes
        .iter()
        .enumerate()
        .map(|(index, node)| {
            let mut displacement = mock_displacements.get(index).cloned().unwrap_or_else(|| {
                json!({
                    "uxMm": 0.0,
                    "uyMm": 0.0,
                    "uzMm": 0.0,
                    "txRad": 0.0,
                    "tyRad": 0.0,
                    "tzRad": 0.0,
                })
            });
            displacement["nodeId"] = node["id"].clone();
            displacement
        })
        .collect();

    results["analysisId"] = Value::String(request.analysis_id);
    results["nodes"] = Value::Array(result_nodes);
    results["displacements"] = Value::Array(displacements);
    Ok(results)
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
    fn analysis_returns_mock_results_with_the_requested_analysis_and_node_ids() {
        let request = AnalysisRequest {
            contract_version: 1,
            analysis_id: "analysis-1".to_string(),
            model: json!({
                "nodes": [
                    { "id": "custom-node", "position": { "x": 1.0, "y": 2.0, "z": 3.0 } }
                ]
            }),
        };
        let result = run_analysis(request).expect("a solicitação válida deve retornar resultados");

        assert_eq!(result["schema"], "structural-results");
        assert_eq!(result["analysisId"], "analysis-1");
        assert_eq!(result["status"], "completed");
        assert_eq!(result["nodes"][0]["nodeId"], "custom-node");
        assert_eq!(result["nodes"][0]["position"]["x"], 1.0);
        assert_eq!(result["displacements"][0]["nodeId"], "custom-node");
    }

    #[test]
    fn analysis_accepts_the_backend_sample_request() {
        let request: AnalysisRequest = serde_json::from_str(include_str!("../input.json"))
            .expect("input.json deve ser válido");
        let result = run_analysis(request).expect("o exemplo do backend deve ser aceito");

        assert_eq!(result["analysisId"], "analysis-demo-001");
        assert_eq!(result["nodes"].as_array().unwrap().len(), 9);
        assert_eq!(result["displacements"].as_array().unwrap().len(), 9);
        assert_eq!(result["elements"].as_array().unwrap().len(), 12);
    }

    #[test]
    fn analysis_rejects_invalid_model_nodes() {
        let request = AnalysisRequest {
            contract_version: 1,
            analysis_id: "analysis-1".to_string(),
            model: Value::Null,
        };
        assert!(run_analysis(request).unwrap_err().contains("lista de nós"));

        let request = AnalysisRequest {
            contract_version: 1,
            analysis_id: "analysis-1".to_string(),
            model: json!({
                "nodes": [
                    { "id": "node-1", "position": { "x": 0.0, "y": 0.0 } }
                ]
            }),
        };
        assert!(run_analysis(request)
            .unwrap_err()
            .contains("coordenada 'z'"));
    }
}
