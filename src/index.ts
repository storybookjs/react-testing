import { defaultDecorateStory, combineParameters } from '@storybook/client-api';
import addons, { mockChannel } from '@storybook/addons';
import type { Meta, StoryFn, StoryContext } from '@storybook/react';

import type { GlobalConfig, StoriesWithPartialProps, TestingStory } from './types';
import { globalRender, isInvalidStory } from './utils';

// Some addons use the channel api to communicate between manager/preview, and this is a client only feature, therefore we must mock it.
addons.setChannel(mockChannel());

let globalStorybookConfig = {};

/** Function that sets the globalConfig of your storybook. The global config is the preview module of your .storybook folder.
 *
 * It should be run a single time, so that your global config (e.g. decorators) is applied to your stories when using `composeStories` or `composeStory`.
 *
 * Example:
 *```jsx
 * // setup.js (for jest)
 * import { setGlobalConfig } from '@storybook/testing-react';
 * import * as globalStorybookConfig from './.storybook/preview';
 *
 * setGlobalConfig(globalStorybookConfig);
 *```
 *
 * @param config - e.g. (import * as globalConfig from '../.storybook/preview')
 */
export function setGlobalConfig(config: GlobalConfig) {
  globalStorybookConfig = config;
}

/**
 * Function that will receive a story along with meta (e.g. a default export from a .stories file)
 * and optionally a globalConfig e.g. (import * from '../.storybook/preview)
 * and will return a composed component that has all args/parameters/decorators/etc combined and applied to it.
 *
 *
 * It's very useful for reusing a story in scenarios outside of Storybook like unit testing.
 *
 * Example:
 *```jsx
 * import { render } from '@testing-library/react';
 * import { composeStory } from '@storybook/testing-react';
 * import Meta, { Primary as PrimaryStory } from './Button.stories';
 *
 * const Primary = composeStory(PrimaryStory, Meta);
 *
 * test('renders primary button with Hello World', () => {
 *   const { getByText } = render(<Primary>Hello world</Primary>);
 *   expect(getByText(/Hello world/i)).not.toBeNull();
 * });
 *```
 *
 * @param story
 * @param meta - e.g. (import Meta from './Button.stories')
 * @param [globalConfig] - e.g. (import * as globalConfig from '../.storybook/preview') this can be applied automatically if you use `setGlobalConfig` in your setup files.
 */
export function composeStory<GenericArgs>(
  story: TestingStory<GenericArgs>,
  meta: Meta,
  globalConfig: GlobalConfig = globalStorybookConfig
) {

  if (isInvalidStory(story)) {
    throw new Error(
      `Cannot compose story due to invalid format. @storybook/testing-react expected a function/object but received ${typeof story} instead.`
    );
  }

  if ((story as any).story !== undefined) {
    throw new Error(
      `StoryFn.story object-style annotation is not supported. @storybook/testing-react expects hoisted CSF stories.
       https://github.com/storybookjs/storybook/blob/next/MIGRATION.md#hoisted-csf-annotations`
    );
  }

  const renderFn = typeof story === 'function' ?  story : story.render ?? globalRender as StoryFn<GenericArgs>;
  const finalStoryFn = (context: StoryContext) => {
    const { passArgsFirst = true } = context.parameters;
    if (!passArgsFirst) {
      throw new Error(
        'composeStory does not support legacy style stories (with passArgsFirst = false).'
      );
    }

    // @ts-ignore
    return renderFn(context.args as GenericArgs, context);
  };

  const combinedDecorators = [
    ...(story.decorators || []),
    ...(meta?.decorators || []),
    ...(globalConfig.decorators || []),
  ];

  const decorated = defaultDecorateStory(
    finalStoryFn as any,
    combinedDecorators as any
  );

  const defaultGlobals = Object.entries(
    (globalConfig.globalTypes || {}) as Record<string, { defaultValue: any }>
  ).reduce((acc, [arg, { defaultValue }]) => {
    if (defaultValue) {
      acc[arg] = defaultValue;
    }
    return acc;
  }, {} as Record<string, { defaultValue: any }>);

  const combinedParameters = combineParameters(
    globalConfig.parameters || {},
    meta?.parameters || {},
    story.parameters || {},
    { component: meta?.component }
  )

  const combinedArgs = { 
    ...meta?.args,
    ...story.args
  }

  const context = {
    componentId: '',
    kind: '',
    title: '',
    id: '',
    name: '',
    story: '',
    argTypes: globalConfig.argTypes || {},
    globals: defaultGlobals,
    parameters: combinedParameters,
    initialArgs: combinedArgs,
    args: combinedArgs,
    viewMode: 'story',
    originalStoryFn: renderFn,
  } as StoryContext;

  const composedStory = (extraArgs: Record<string, any>) => {
    return decorated({
      ...context,
      args: {
        ...combinedArgs, ...extraArgs
      }
    })
  }
  const boundPlay = ({ canvasElement }: {canvasElement: StoryContext['canvasElement']}) => {
    // @ts-ignore
    story.play?.({ ...context, canvasElement });
  }

  
  composedStory.args = combinedArgs
  composedStory.play = boundPlay;
  composedStory.decorators = combinedDecorators
  composedStory.parameters = combinedParameters

  return composedStory as StoryFn<Partial<GenericArgs>>
}

type StoryFileExport = { default: Meta, __esModule?: boolean }
type Entries<T> = { [K in keyof T]: [K, T[K]] }[keyof T];
function ObjectEntries<T extends object>(t: T): Entries<T>[] {
  return Object.entries(t) as any;
}


/**
 * Function that will receive a stories import (e.g. `import * as stories from './Button.stories'`)
 * and optionally a globalConfig (e.g. `import * from '../.storybook/preview`)
 * and will return an object containing all the stories passed, but now as a composed component that has all args/parameters/decorators/etc combined and applied to it.
 *
 *
 * It's very useful for reusing stories in scenarios outside of Storybook like unit testing.
 *
 * Example:
 *```jsx
 * import { render } from '@testing-library/react';
 * import { composeStories } from '@storybook/testing-react';
 * import * as stories from './Button.stories';
 *
 * const { Primary, Secondary } = composeStories(stories);
 *
 * test('renders primary button with Hello World', () => {
 *   const { getByText } = render(<Primary>Hello world</Primary>);
 *   expect(getByText(/Hello world/i)).not.toBeNull();
 * });
 *```
 *
 * @param storiesImport - e.g. (import * as stories from './Button.stories')
 * @param [globalConfig] - e.g. (import * as globalConfig from '../.storybook/preview') this can be applied automatically if you use `setGlobalConfig` in your setup files.
 */
export function composeStories<
  TModule extends StoryFileExport
>(storiesImport: TModule, globalConfig?: GlobalConfig) {
  const { default: meta, __esModule, ...stories } = storiesImport;

  // This function should take this as input: 
  // {
  //   default: Meta,
  //   Primary: Story<ButtonProps>, <-- Props extends Args
  //   Secondary: Story<OtherProps>,
  // }
    
  // And return this as output: 
  // {
  //   Primary: ComposedStory<Partial<ButtonProps>>,
  //   Secondary: ComposedStory<Partial<OtherProps>>,
  // }

  // Compose an object containing all processed stories passed as parameters
  const composedStories = ObjectEntries(stories).reduce<Partial<StoriesWithPartialProps<TModule>>>(
    (storiesMap, [_, story]) => {
      const result = Object.assign(storiesMap, composeStory(story, meta, globalConfig));
      return result;
    },
    {}
  );

  return composedStories as unknown as Omit<StoriesWithPartialProps<TModule>, keyof StoryFileExport>;
}
