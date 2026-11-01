import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common/command';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { MenuContribution } from '@theia/core/lib/common/menu';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { LanguageGrammarDefinitionContribution } from '@theia/monaco/lib/browser/textmate/textmate-contribution';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';

import { O1CommandContribution, O1MenuContribution } from './rovant-commands';
import { RosLangGrammarContribution } from './ros-lang-grammar';
import { PythonLangGrammarContribution } from './python-lang-grammar';
import { RoboticsLanguagesContribution } from './robotics-languages';
import { LanguageActivationContribution } from './language-activation';
import { UrdfViewerWidget } from './urdf-viewer/urdf-viewer-widget';
import { RosTopicsWidget } from './ros-topics/ros-topics-widget';
import { ToolchainInstallerWidget } from './toolchain/toolchain-installer';
import { TemplatesContribution } from './templates/templates-contribution';
import { RosDebugConfigContribution } from './ros-debug-config';
import { O1BrandingContribution } from './rovant-branding';

export default new ContainerModule(bind => {
    // Commands & menus — also FrontendApplicationContribution for onStart() auto-preview
    bind(O1CommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(O1CommandContribution);
    bind(FrontendApplicationContribution).toService(O1CommandContribution);
    bind(KeybindingContribution).toService(O1CommandContribution);

    bind(MenuContribution).to(O1MenuContribution).inSingletonScope();

    // Rovant branding
    bind(O1BrandingContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(O1BrandingContribution);

    // Debug config (launch.json writer)
    bind(RosDebugConfigContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(RosDebugConfigContribution);

    // ROS msg/srv/action grammar
    bind(LanguageGrammarDefinitionContribution).to(RosLangGrammarContribution).inSingletonScope();

    // Python + robotics/drone languages (grammar + detection + keyword completion)
    bind(FrontendApplicationContribution).to(PythonLangGrammarContribution).inSingletonScope();
    bind(FrontendApplicationContribution).to(RoboticsLanguagesContribution).inSingletonScope();

    // Re-apply language ids to open models so files never stay 'Plain Text'
    bind(FrontendApplicationContribution).to(LanguageActivationContribution).inSingletonScope();

    // Project templates
    bind(TemplatesContribution).toSelf().inSingletonScope();

    // URDF viewer
    bind(UrdfViewerWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: UrdfViewerWidget.ID,
        createWidget: () => ctx.container.createChild().get(UrdfViewerWidget),
    })).inSingletonScope();

    // ROS topics viewer
    bind(RosTopicsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: RosTopicsWidget.ID,
        createWidget: () => ctx.container.createChild().get(RosTopicsWidget),
    })).inSingletonScope();

    // Toolchain installer
    bind(ToolchainInstallerWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: ToolchainInstallerWidget.ID,
        createWidget: () => ctx.container.createChild().get(ToolchainInstallerWidget),
    })).inSingletonScope();
});
