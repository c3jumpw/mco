// One entry point for the module player and builder: render an interactive block, and know how it behaves.
import type { Block } from '../lib/types';
import type { StepProps } from './kit';
import { CalendarSimStep, TaskSimStep, TriageSimStep } from './sims';
import { ChecklistStep, FlashcardsStep, HotspotStep, ImageStep, MatchStep, OrderStep, RealWorkStep, ScenarioStep, SortStep, VisualStep } from './steps';
import type { InteractiveBlock, InteractiveType } from './types';

export type { StepResult, InteractiveBlock, InteractiveType } from './types';

const TYPES = new Set<string>(['visual', 'image', 'scenario', 'order', 'sort', 'match', 'flashcards', 'checklist', 'hotspot', 'realwork', 'sim']);
export const isInteractive = (b: Block): b is InteractiveBlock => TYPES.has(b.type);

/** Steps people can move past without doing anything. */
export const isPassive = (b: InteractiveBlock) => b.type === 'visual' || b.type === 'image' || b.type === 'flashcards';
/** Steps that produce a score worth reporting. */
export const isScored = (b: InteractiveBlock) => ['scenario', 'order', 'sort', 'match', 'hotspot', 'sim'].includes(b.type);

export function InteractiveStep(props: StepProps<InteractiveBlock>) {
  const b = props.block;
  const p = props as StepProps<never>;
  switch (b.type) {
    case 'visual': return <VisualStep {...p} block={b} />;
    case 'image': return <ImageStep {...p} block={b} />;
    case 'scenario': return <ScenarioStep {...p} block={b} />;
    case 'order': return <OrderStep {...p} block={b} />;
    case 'sort': return <SortStep {...p} block={b} />;
    case 'match': return <MatchStep {...p} block={b} />;
    case 'flashcards': return <FlashcardsStep {...p} block={b} />;
    case 'checklist': return <ChecklistStep {...p} block={b} />;
    case 'hotspot': return <HotspotStep {...p} block={b} />;
    case 'realwork': return <RealWorkStep {...p} block={b} />;
    case 'sim':
      if (b.tool === 'tasks') return <TaskSimStep {...p} block={b} />;
      if (b.tool === 'calendar') return <CalendarSimStep {...p} block={b} />;
      return <TriageSimStep {...p} block={b} />;
  }
}

export const STEP_ICON: Record<InteractiveType, string> = {
  visual: 'sparkle', image: 'eye', scenario: 'chat', order: 'list', sort: 'sliders', match: 'link', flashcards: 'replay',
  checklist: 'tasks', hotspot: 'target', realwork: 'pen', sim: 'play',
};

/** What a learner must do before Next works. */
export function blockedHint(b: InteractiveBlock): string {
  switch (b.type) {
    case 'scenario': return 'Pick an answer to continue';
    case 'order': case 'sort': case 'match': return 'Check your answer to continue';
    case 'checklist': return 'Tick every item to continue';
    case 'hotspot': return 'Find every spot to continue';
    case 'realwork': return 'Do the action to continue';
    case 'sim': return 'Finish the practice and check it to continue';
    default: return '';
  }
}

/** Starter content for a new block in the builder: a small, working example to edit. */
export function newInteractive(type: InteractiveType): InteractiveBlock {
  switch (type) {
    case 'visual': return { type, title: 'How it works', layout: 'steps', items: [{ title: 'First step', body: 'What happens here.' }, { title: 'Second step', body: 'What happens next.' }, { title: 'Third step', body: 'How it finishes.' }] };
    case 'image': return { type, src: '', alt: '', caption: '' };
    case 'scenario': return {
      type, title: 'A message comes in', message: { from: 'The owner', channel: 'Chat', time: '9:12 PM', text: 'Can you move my 10am tomorrow?' }, question: 'What do you do first?',
      choices: [
        { text: 'Acknowledge now, check the calendar and offer two new times.', result: 'best', feedback: 'Fast acknowledgement plus options keeps things moving.' },
        { text: 'Wait until the sync tomorrow.', result: 'poor', feedback: 'The meeting would be over by then.' },
      ],
    };
    case 'order': return { type, title: 'Put the steps in order', prompt: 'Drag them so the first step is at the top.', items: ['First', 'Second', 'Third'] };
    case 'sort': return { type, title: 'Sort these', prompt: 'Put each card in the right group.', groups: ['Group A', 'Group B'], items: [{ text: 'An A item', group: 0 }, { text: 'A B item', group: 1 }] };
    case 'match': return { type, title: 'Match them up', prompt: 'Match each item to its partner.', pairs: [{ left: 'Item', right: 'Partner' }, { left: 'Another item', right: 'Its partner' }] };
    case 'flashcards': return { type, title: 'Key ideas', cards: [{ front: 'Term', back: 'What it means' }] };
    case 'checklist': return { type, title: 'Before you move on', items: ['First thing to check', 'Second thing to check'] };
    case 'hotspot': return { type, title: 'Find it on screen', image: '', steps: [{ prompt: 'Click the button that…', x: 40, y: 40, w: 20, h: 10 }] };
    case 'realwork': return { type, title: 'Put it into practice', body: 'This adds a real task to your list.', action: 'task', task: { title: 'Practice: write your first task', notes: '', due_days: 2 } };
    case 'sim': return {
      type, tool: 'tasks', title: 'Log the owner’s requests', brief: 'Turn each request into a clear task.', space: 'Business', lists: ['Admin tasks', 'Client work'],
      requests: [{ id: 'r1', from: 'The owner', text: 'Remind me to send the invoice to Acme on Friday.', expect: { list: 'Admin tasks', type: 'Operational', duration: 'Quick task', keywords: ['Acme', 'invoice'] } }],
    };
  }
}
