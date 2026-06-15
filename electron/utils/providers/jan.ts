import { OpenAICompatibleProvider } from './openai-compatible';

export class JanProvider extends OpenAICompatibleProvider {
  constructor(baseUrl = "http://localhost:1337") {
    super("Jan", baseUrl);
  }
}
