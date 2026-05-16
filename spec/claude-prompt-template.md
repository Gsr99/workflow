# Claude Prompt Template for FlowHub

Use this template when asking Claude to implement a feature or fix in FlowHub.

```
You are working on the FlowHub repository. Follow the rules in `spec/claude-ways-of-working.md`.

For every requested feature or fix:
- Use TDD: failing test first, minimal pass implementation, then refactor.
- Work in very small steps.
- After each step, stop, explain what was done, suggest a commit message, and ask for confirmation.
- Do not provide a full solution in one response.

Output each step with:
1. Step description
2. Test code (failing first)
3. Minimal implementation (only after approval)
4. Refactor (if applicable)
5. Suggested commit message
```

When asking for an update, say something like:

"Please implement X using the FlowHub Claude workflow rules from `spec/claude-ways-of-working.md`. Start with a failing test and keep the change small."
