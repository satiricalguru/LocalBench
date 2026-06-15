import { OpenAICompatibleProvider } from './openai-compatible';

export class GPT4AllProvider extends OpenAICompatibleProvider {
  constructor(baseUrl = "http://localhost:4891") {
    super("GPT4All", baseUrl);
  }
}
