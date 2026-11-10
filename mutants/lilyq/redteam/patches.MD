**Target commit:** `81c4b121b3e3c70b20fd735744799ea6ee9bb57b`

### Mutant 1 — R3: Omit remaining work from the final summary

**Requirement:** R3 — On the final allowed step, the model must include the max-steps instruction requiring a summary of work done and work remaining.
`R3: the final allowed step has no tools, carries the max-steps prompt, and runs no tools`

```diff
- - List of any remaining tasks that were not completed
+ - Briefly describe the overall outcome without discussing unfinished tasks
```

This mutant removes the requirement to identify unfinished tasks, so the final summary may omit work that still needs to be completed. The property only checks that the final message contains `"MAXIMUM STEPS REACHED"`, not that the prompt explicitly requires a summary of remaining tasks. 

### Mutant 2 — R5: Delay planning until the final response

**Requirement:** R5 — The first model request must instruct the model to post a short numbered plan before using tools.
`R5: adding a step limit adds exactly the plan instruction to the first request`

```diff
 export const stepPlanPrompt = (steps: number) =>
-  `This agent has a limit of ${steps} steps for this task. Before your first tool call, post a short numbered plan of how you will divide the work into steps, then start immediately. Do not wait for the user to approve the plan.`
+  `This agent has a limit of ${steps} steps for this task. Include a short numbered plan describing how you divided the work in your final response.`
```

This mutant changes the planning instruction so the model produces its plan after completing the task rather than before using tools, violating R5's planning requirement. The property checks that the first request contains `"numbered plan"` and the step count, and that exactly one system prompt component is added. It does not verify when the model is instructed to plan, so this mutant could pass.

### Mutant 3 — R5: Require user approval before executing tools

**Requirement:** R5 — The model must post a numbered plan before using tools, without waiting for user approval.
`R5: adding a step limit adds exactly the plan instruction to the first request`

```diff
 export const stepPlanPrompt = (steps: number) =>
-  `This agent has a limit of ${steps} steps for this task. Before your first tool call, post a short numbered plan of how you will divide the work into steps, then start immediately. Do not wait for the user to approve the plan.`
+  `This agent has a limit of ${steps} steps for this task. Before your first tool call, post a short numbered plan of how you will divide the work into steps, then wait for the user to approve the plan.`
```

This mutant makes the agent wait for user approval after posting its plan, instead of immediately continuing with the task. The property checks for `"numbered plan"` and the step count but does not verify that the prompt instructs the model to proceed without approval. Therefore, this mutant could pass despite violating R5.