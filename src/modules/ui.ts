/**
 * UI 风格辅助模块 (参考 Mole / Clack 交互设计)
 * 统一提供极简、高质感的终端样式与交互体验
 */
import chalk from 'chalk';
import * as p from '@clack/prompts';

export const banner = `
  ${chalk.cyan.bold('⚓ tug')} ${chalk.dim('— 浏览器插件上架助手')}
  ${chalk.dim('─────────────────────────────────────────────')}
`;

export function printHeader(title: string, subtitle?: string): void {
  console.log(`\n${chalk.bgCyan.black.bold(` ${title} `)} ${subtitle ? chalk.dim(subtitle) : ''}`);
}

export function printSection(title: string): void {
  console.log(`\n${chalk.cyan('◆')} ${chalk.bold(title)}`);
}

export function printStatusRow(label: string, value: string, ok = true): void {
  const icon = ok ? chalk.green('✔') : chalk.red('✖');
  const dotLeader = chalk.dim('.'.repeat(Math.max(2, 32 - label.length)));
  console.log(`  ${icon} ${chalk.dim(label)} ${dotLeader} ${ok ? chalk.white(value) : chalk.red(value)}`);
}

export function printInfoRow(label: string, value: string): void {
  const dotLeader = chalk.dim('.'.repeat(Math.max(2, 32 - label.length)));
  console.log(`  ${chalk.blue('ℹ')} ${chalk.dim(label)} ${dotLeader} ${chalk.white(value)}`);
}

export function printCard(content: string[]): void {
  const width = 50;
  console.log(chalk.dim(`  ┌${'─'.repeat(width)}┐`));
  for (const line of content) {
    const pad = Math.max(0, width - line.replace(/\u001b\[.*?m/g, '').length - 2);
    console.log(chalk.dim('  │ ') + line + ' '.repeat(pad) + chalk.dim(' │'));
  }
  console.log(chalk.dim(`  └${'─'.repeat(width)}┘`));
}

export { p };
