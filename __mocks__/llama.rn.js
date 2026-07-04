/* Mock for the llama.rn native module (no JSI runtime in jest). */
const mockContext = {
  completion: jest.fn(async () => ({ text: '' })),
  stopCompletion: jest.fn(async () => {}),
  release: jest.fn(async () => {}),
};

module.exports = {
  initLlama: jest.fn(async () => mockContext),
  releaseAllLlama: jest.fn(async () => {}),
  LlamaContext: function LlamaContext() {
    return mockContext;
  },
};
