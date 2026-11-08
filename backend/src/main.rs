use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, Read};

#[derive(Debug, Deserialize)]
struct AnalysisRequest {
    requestId: String,
    model: Value,
}

#[derive(Debug, Serialize)]
struct AnalysisResponse {
    request_id: String,
    schema: String,
    version: u32,
    projectId: String,
    analysisId: String,
    status: String,
    generatedAt: String,
    message: String,
    results: MockResults,
    nodes: Vec<NodeResult>
}

#[derive(Debug, Serialize)]
struct MockResults {
    max_displacement: f64,
    max_reaction: f64,
    processed_nodes: usize,
}


#[derive(Debug, Serialize)]
struct NodeResult {
    nodeId: String,
    position: Point3D
}

#[derive(Debug, Serialize)]
struct Point3D {
    x: f64,
    y: f64,
    z: f64
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    // Lê todo o JSON recebido pela entrada padrão.
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;

    // Converte o JSON recebido em uma estrutura Rust.
    let request: AnalysisRequest = serde_json::from_str(&input)?;

    // Obtém a quantidade de nós, caso o modelo contenha essa informação.
    let processed_nodes = request.model["nodes"]
        .as_array()
        .map_or(0, |nodes| nodes.len());

    // Simula a execução de uma análise estrutural.
    let response = AnalysisResponse {
        request_id: request.requestId,
        schema: "structural-results".to_string(),
        version: 1,
        projectId: "proj-001".to_string(),
        analysisId: "analysis-demo-001".to_string(),
        status: "success".to_string(),
        generatedAt: "2026-11-06T12:00:00.000Z".to_string(),
        message: "Análise simulada com sucesso".to_string(),
        results: MockResults {
            max_displacement: 0.0025,
            max_reaction: 125.75,
            processed_nodes,
        },
        nodes: vec![
            NodeResult {
                nodeId: "N1".to_string(),
                position: Point3D { x: 0.0, y: 0.0, z: 0.0 },
            },
            NodeResult {
                nodeId: "N2".to_string(),
                position: Point3D { x: 10.0, y: 0.0, z: 0.0 },
            },
        ],
    };

    // Converte a resposta Rust para JSON e escreve na saída padrão.
    let output = serde_json::to_string_pretty(&response)?;
    println!("{output}");

    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("Erro ao processar solicitação: {error}");
        std::process::exit(1);
    }
}