import { describe, it, expect } from 'vitest';
import { getScorer, BenchmarkTask } from '../electron/utils/benchmark-runner';

describe('Scorer Engine Heuristics', () => {

  it('ExactScorer evaluates matches accurately', () => {
    const scorer = getScorer('exact');
    const task: BenchmarkTask = {
      id: 'test',
      category: 'reasoning',
      name: 'test',
      description: 'test',
      prompt: 'test',
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 1000,
      expectedOutput: 'Yes',
      scorerType: 'exact'
    };

    expect(scorer.score('Yes', task)).toBe(1.0);
    expect(scorer.score('  yes  ', task)).toBe(1.0);
    expect(scorer.score('No', task)).toBe(0.0);
  });

  it('ContainsScorer matches keywords correctly', () => {
    const scorer = getScorer('contains');
    const task: BenchmarkTask = {
      id: 'test',
      category: 'reasoning',
      name: 'test',
      description: 'test',
      prompt: 'test',
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 1000,
      expectedOutput: 'python, function, list',
      scorerType: 'contains'
    };

    expect(scorer.score('Here is a python list function', task)).toBe(1.0);
    expect(scorer.score('A python list matches', task)).toBe(2/3);
    expect(scorer.score('Completely unrelated text', task)).toBe(0.0);
  });

  it('NumericScorer handles numeric proximity', () => {
    const scorer = getScorer('numeric');
    const task: BenchmarkTask = {
      id: 'test',
      category: 'reasoning',
      name: 'test',
      description: 'test',
      prompt: 'test',
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 1000,
      expectedOutput: '5.5',
      scorerType: 'numeric'
    };

    expect(scorer.score('The answer is 5.5', task)).toBe(1.0);
    expect(scorer.score('I have 5.4 apples', task)).toBe(0.5); // within 2%
    expect(scorer.score('The number is 10', task)).toBe(0.0);
  });

  it('SyllogismScorer rates deductive lists', () => {
    const scorer = getScorer('syllogism');
    const task: BenchmarkTask = {
      id: 'test',
      category: 'reasoning',
      name: 'test',
      description: 'test',
      prompt: 'test',
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 1000,
      scorerType: 'syllogism'
    };

    const goodResponse = "1. Yes\n2. No\n3. Yes\n4. Yes\n5. No";
    const partialResponse = "1. Yes\n2. Yes\n3. Yes\n4. Yes\n5. No";

    expect(scorer.score(goodResponse, task)).toBe(1.0);
    expect(scorer.score(partialResponse, task)).toBe(0.8);
  });

  it('HaikuScorer identifies line structure', () => {
    const scorer = getScorer('haiku');
    const task: BenchmarkTask = {
      id: 'test',
      category: 'creative',
      name: 'test',
      description: 'test',
      prompt: 'test',
      temperature: 0.7,
      maxTokens: 10,
      timeoutMs: 1000,
      scorerType: 'haiku'
    };

    const goodHaiku = "Silicon mind works\nWriting code lines through the night\nLearning all the time";
    expect(scorer.score(goodHaiku, task)).toBeGreaterThanOrEqual(0.7); // 3 lines + AI theme + word counts
  });

});
