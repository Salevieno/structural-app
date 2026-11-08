use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, Read};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisRequest {
    contract_version: u32,
    analysis_id: String,
    model: Value,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum RequestEnvelope {
    Direct(AnalysisRequest),
    Wrapped { request: AnalysisRequest },
}

#[derive(Debug, Serialize)]
struct StructuralResultsDocument {
    schema: &'static str,
    version: u32,
    projectId: String,
    analysisId: String,
    status: &'static str,
    generatedAt: String,
    summary: Summary,
    nodes: Vec<NodeResult>,
    displacements: Vec<DisplacementResult>,
    reactions: Vec<ReactionResult>,
    elements: Vec<ElementResult>,
}

#[derive(Debug, Serialize)]
struct Summary {
    maxDisplacementMm: f64,
    maxRotationRad: f64,
    reactionCount: usize,
}

#[derive(Debug, Serialize)]
struct NodeResult {
    nodeId: String,
    position: Position,
}

#[derive(Debug, Serialize)]
struct Position {
    x: f64,
    y: f64,
    z: f64,
}

#[derive(Debug, Serialize)]
struct DisplacementResult {
    nodeId: String,
    uxMm: f64,
    uyMm: f64,
    uzMm: f64,
    txRad: f64,
    tyRad: f64,
    tzRad: f64,
}

#[derive(Debug, Serialize)]
struct ReactionResult {
    nodeId: String,
    Fx_kN: f64,
    Fy_kN: f64,
    Fz_kN: f64,
    Mx_kNm: f64,
    My_kNm: f64,
    Mz_kNm: f64,
}

#[derive(Debug, Serialize)]
struct ElementResult {
    elementId: String,
    nodeIds: Vec<String>,
    #[serde(rename = "type")]
    type_name: String,
    normalForce_kN: Option<f64>,
    shearForceY_kN: Option<f64>,
    bendingMoment_kNm: Option<f64>,
    stress: Option<f64>,
}

fn parse_request(input: &str) -> Result<AnalysisRequest, Box<dyn std::error::Error>> {
    let envelope: RequestEnvelope = serde_json::from_str(input)?;
    match envelope {
        RequestEnvelope::Direct(request) => Ok(request),
        RequestEnvelope::Wrapped { request } => Ok(request),
    }
}

fn node_position(node: &Value) -> Position {
    let pos = node
        .get("position")
        .and_then(Value::as_object)
        .map(|map| map.clone())
        .unwrap_or_default();
    let x = pos.get("x").and_then(Value::as_f64).unwrap_or(0.0);
    let y = pos.get("y").and_then(Value::as_f64).unwrap_or(0.0);
    let z = pos.get("z").and_then(Value::as_f64).unwrap_or(0.0);
    Position { x, y, z }
}

fn mock_response(request: &AnalysisRequest) -> StructuralResultsDocument {
    let model = &request.model;
    let empty_vec = Vec::new();
    let nodes_value = model.get("nodes").and_then(Value::as_array).unwrap_or(&empty_vec);
    let line_elements = model.get("lineElements").and_then(Value::as_array).unwrap_or(&empty_vec);
    let mesh = model.get("mesh").and_then(Value::as_object).map(|map| map.clone()).unwrap_or_default();
    let mesh_elements = mesh.get("elements").and_then(Value::as_array).unwrap_or(&empty_vec);
    let project_id = model
        .get("projectId")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| "proj-001".to_string());
    let nodes: Vec<NodeResult> = nodes_value
        .iter()
        .map(|node| {
            let node_id = node.get("id").and_then(Value::as_str).unwrap_or("N0").to_string();
            NodeResult {
                nodeId: node_id,
                position: node_position(node),
            }
        })
        .collect();

    let displacements: Vec<DisplacementResult> = nodes_value
        .iter()
        .enumerate()
        .map(|(idx, node)| {
            let node_id = node.get("id").and_then(Value::as_str).unwrap_or("N0").to_string();
            DisplacementResult {
                nodeId: node_id,
                uxMm: (idx as f64 * 0.08) + 0.02,
                uyMm: (idx as f64 * 0.12) + 0.04,
                uzMm: 0.0,
                txRad: (idx as f64 + 1.0) * 0.0004,
                tyRad: 0.0,
                tzRad: 0.0,
            }
        })
        .collect();

    let reactions = vec![ReactionResult {
        nodeId: "N1".to_string(),
        Fx_kN: 12.4,
        Fy_kN: 50.0,
        Fz_kN: 0.0,
        Mx_kNm: 0.0,
        My_kNm: 0.0,
        Mz_kNm: 0.0,
    }];

    let mut elements: Vec<ElementResult> = line_elements
        .iter()
        .map(|element| {
            let element_id = element.get("id").and_then(Value::as_str).unwrap_or("E0").to_string();
            let node_ids = element
                .get("nodeIds")
                .and_then(Value::as_array)
                .map(|array| {
                    array
                        .iter()
                        .filter_map(|value| value.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            ElementResult {
                elementId: element_id,
                nodeIds: node_ids,
                type_name: element.get("type").and_then(Value::as_str).unwrap_or("line1d").to_string(),
                normalForce_kN: Some(8.5),
                shearForceY_kN: Some(0.8),
                bendingMoment_kNm: Some(1.2),
                stress: None,
            }
        })
        .collect();

    let quad_elements: Vec<ElementResult> = mesh_elements
        .iter()
        .map(|element| {
            let element_id = element.get("id").and_then(Value::as_str).unwrap_or("Q0").to_string();
            let node_ids = element
                .get("nodeIds")
                .and_then(Value::as_array)
                .map(|array| {
                    array
                        .iter()
                        .filter_map(|value| value.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            ElementResult {
                elementId: element_id,
                nodeIds: node_ids,
                type_name: element.get("type").and_then(Value::as_str).unwrap_or("quad4").to_string(),
                normalForce_kN: None,
                shearForceY_kN: None,
                bendingMoment_kNm: None,
                stress: Some(12.6),
            }
        })
        .collect();

    elements.extend(quad_elements);

    StructuralResultsDocument {
        schema: "structural-results",
        version: 1,
        projectId: project_id,
        analysisId: request.analysis_id.clone(),
        status: "completed",
        generatedAt: "2026-11-08T00:00:00.000Z".to_string(),
        summary: Summary {
            maxDisplacementMm: 0.3,
            maxRotationRad: 0.0032,
            reactionCount: reactions.len(),
        },
        nodes,
        displacements,
        reactions,
        elements,
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;

    let request = parse_request(&input)?;
    let response = mock_response(&request);
    println!("{}", serde_json::to_string_pretty(&response)?);

    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("Erro ao processar solicitação: {error}");
        std::process::exit(1);
    }
}
