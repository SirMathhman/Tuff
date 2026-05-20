describe('Jest setup', () => {
  test('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should handle string equality', () => {
    expect('hello').toEqual('hello');
  });
});

