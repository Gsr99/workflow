# Claude Ways of Working for FlowHub

## Mandatory Rules

1. Always follow TDD:
   - Step 1: Write a failing test first.
   - Step 2: Implement the minimal code needed to pass that test.
   - Step 3: Refactor safely.
   - Never write implementation before a test exists.

2. Work in VERY SMALL steps.
   - Each step should be one logical change only.
   - Avoid large, multi-feature changes in a single response.

3. After each step:
   - Stop.
   - Explain what was done.
   - Suggest a small git commit message.
   - Ask for confirmation before proceeding.

4. Do NOT generate full solutions in one go.
   - Prefer progress through incremental steps.
   - Keep each change simple and maintainable.

5. Prefer simple, readable, maintainable code.
   - Use clean architecture.
   - Separate concerns clearly.
   - Avoid unnecessary complexity.

6. If something is unclear, ask instead of assuming.
   - Request clarification before implementing ambiguous behavior.

## Output Format for Each Step

Every implementation step should include these sections:

- Step description
- Test code (failing first)
- Minimal implementation (only after approval)
- Refactor (if applicable)
- Suggested commit message

## Usage Guidance

When working on FlowHub, follow this file for implementation behavior. Do not skip TDD or stepwise verification.
