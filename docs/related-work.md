# Related work

Self-managed memory and context restructuring have substantial prior work. The broad reframe of context as editable state should not be presented as uniquely established by this repository.

This is an initial comparison based on the linked papers' descriptions, rather than an exhaustive novelty review or reproduction of their implementations.

## MemGPT

[MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560) describes model-directed management of memory tiers, drawing on operating-system memory management. It is relevant prior work for agents managing their own memory.

This proposal focuses on executable transformations of the current structured Message[] state. That specific interface is the object of investigation here; it does not establish a general claim that self-managed memory is new.

## AgentFold

[AgentFold: Long-Horizon Web Agents with Proactive Context Management](https://arxiv.org/abs/2510.24699) describes proactive management of historical trajectories through granular condensation and deeper consolidation. This overlaps closely with deciding how different parts of context should be represented.

Our proposed action is a JavaScript function over typed messages and parts, allowing direct reference to preserved content and insertion of annotations. A detailed comparison of operation expressiveness and learned behavior remains necessary before claiming an advantage.

## Context-Folding and FoldGRPO

[Scaling Long-Horizon LLM Agent via Context-Folding](https://arxiv.org/abs/2510.11967) describes branching into sub-trajectories and folding them into summaries, with a training framework for that behavior. It connects context management with learned policies for long tasks.

The prototype here permits arbitrary validated edits to earlier messages and parts rather than specifying a branch-and-return workflow. Whether this broader action space helps or makes learning harder is open.

## FoldAct

[FoldAct: Efficient and Stable Context Folding for Long-Horizon Search Agents](https://arxiv.org/abs/2512.22733) discusses training difficulties arising when summaries change an agent's future observations. This is directly relevant to the proposed RL direction: state edits affect the inputs from which later decisions are made.

This repository proposes evaluation of executable mutations; it does not implement FoldAct or an alternative training algorithm.

## What to test here

The concrete combination to investigate is model-written code over canonical structured state, selective preservation without regeneration, agent-authored annotations within that state, and explicit prefix-reuse cost. These are design choices to compare experimentally. This note is not evidence that the combination is unprecedented.
