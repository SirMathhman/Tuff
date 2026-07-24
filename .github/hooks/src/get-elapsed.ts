console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      additionalContext: "You have been working on this task for 0 seconds.",
    },
  }),
);
process.exit(2);
