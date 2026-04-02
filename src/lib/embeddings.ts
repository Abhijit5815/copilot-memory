import { debugLog } from './settings';

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<Float32Array[]>;
  isAvailable(): Promise<boolean>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly model: string;
  readonly dimensions: number;
  private apiKey: string;
  private baseUrl: string;

  constructor(options: {
    apiKey: string;
    model?: string;
    dimensions?: number;
    baseUrl?: string;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'text-embedding-3-small';
    this.dimensions = options.dimensions ?? 1536;
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const url = `${this.baseUrl}/embeddings`;
    const body = JSON.stringify({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      data: { embedding: number[]; index: number }[];
    };

    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => new Float32Array(d.embedding));
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.apiKey) return false;
      const result = await this.embed(['test']);
      return result.length > 0;
    } catch {
      debugLog('OpenAI embedding provider not available');
      return false;
    }
  }
}

export class NoopEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'noop';
  readonly model = 'none';
  readonly dimensions = 0;

  async embed(_texts: string[]): Promise<Float32Array[]> {
    return [];
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}

export function createEmbeddingProvider(config: {
  provider: string;
  apiKey?: string;
  model?: string;
  dimensions?: number;
  baseUrl?: string;
}): EmbeddingProvider {
  switch (config.provider) {
    case 'openai':
      if (!config.apiKey) {
        debugLog('OpenAI embedding provider requires apiKey, falling back to noop');
        return new NoopEmbeddingProvider();
      }
      return new OpenAIEmbeddingProvider({
        apiKey: config.apiKey,
        model: config.model,
        dimensions: config.dimensions,
        baseUrl: config.baseUrl,
      });
    default:
      return new NoopEmbeddingProvider();
  }
}
