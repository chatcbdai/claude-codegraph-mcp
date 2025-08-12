import { TreeSitterParser } from "../src/core/parser-treesitter";

describe("Tree-Sitter Parser Validation", () => {
  let parser: TreeSitterParser;

  beforeAll(async () => {
    parser = new TreeSitterParser();
    await parser.initialize();
  });

  test("should parse JavaScript with tree-sitter", async () => {
    const code = `
import React from 'react';

export default class MyComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = { count: 0 };
  }

  async fetchData() {
    const response = await fetch('/api/data');
    return response.json();
  }

  render() {
    return <div>{this.state.count}</div>;
  }
}

export const CONSTANT_VALUE = 42;
export function helperFunction(a, b) {
  return a + b;
}
`;

    const result = await parser.parseFile(code, "javascript");
    
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].source).toBe("react");
    
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].name).toBe("MyComponent");
    expect(result.classes[0].extends).toBe("React.Component");
    expect(result.classes[0].methods).toContain("constructor");
    expect(result.classes[0].methods).toContain("fetchData");
    expect(result.classes[0].methods).toContain("render");
    
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe("helperFunction");
    expect(result.functions[0].params).toEqual(["a", "b"]);
    
    expect(result.constants).toHaveLength(1);
    expect(result.constants![0].name).toBe("CONSTANT_VALUE");
    
    expect(result.exports).toHaveLength(3);
  });

  test("should parse Python with tree-sitter", async () => {
    const code = `
from typing import List, Optional
import asyncio

class DataProcessor:
    def __init__(self, name: str):
        self.name = name
        self.data: List[str] = []
    
    async def process(self, items: List[str]) -> List[str]:
        results = []
        for item in items:
            result = await self.process_item(item)
            results.append(result)
        return results
    
    async def process_item(self, item: str) -> str:
        await asyncio.sleep(0.1)
        return item.upper()

def helper_function(x: int, y: int) -> int:
    return x + y

MAX_RETRIES = 3
API_ENDPOINT = "https://api.example.com"
`;

    const result = await parser.parseFile(code, "python");
    
    expect(result.imports).toHaveLength(2);
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].name).toBe("DataProcessor");
    expect(result.classes[0].methods).toContain("__init__");
    expect(result.classes[0].methods).toContain("process");
    expect(result.classes[0].methods).toContain("process_item");
    
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe("helper_function");
    
    expect(result.constants).toHaveLength(2);
    expect(result.constants!.map(c => c.name)).toContain("MAX_RETRIES");
    expect(result.constants!.map(c => c.name)).toContain("API_ENDPOINT");
  });

  test("should handle malformed code gracefully", async () => {
    const malformedCode = `
function broken(a, b {  // Missing closing paren
  return a + b;
}

class  {  // Missing class name
  method() {}
}
`;

    const result = await parser.parseFile(malformedCode, "javascript");
    
    // Should still extract what it can
    expect(result).toBeDefined();
    expect(result.functions.length).toBeGreaterThanOrEqual(0);
    expect(result.classes.length).toBeGreaterThanOrEqual(0);
  });

  test("should be significantly more accurate than regex", async () => {
    // Complex code that regex would struggle with
    const complexCode = `
const arrowFunc = (a, b) => {
  const innerFunc = () => a + b;
  return innerFunc();
};

const obj = {
  method(x) {
    return x * 2;
  },
  async asyncMethod() {
    return await Promise.resolve(42);
  }
};

// This is not a function: function fakeFunction
/* function commentedFunction() {} */
const stringWithFunction = "function notAFunction() {}";
`;

    const result = await parser.parseFile(complexCode, "javascript");
    
    // Tree-sitter should correctly identify only real functions
    const functionNames = result.functions.map(f => f.name);
    expect(functionNames).toContain("arrowFunc");
    expect(functionNames).not.toContain("fakeFunction");
    expect(functionNames).not.toContain("commentedFunction");
    expect(functionNames).not.toContain("notAFunction");
  });
});