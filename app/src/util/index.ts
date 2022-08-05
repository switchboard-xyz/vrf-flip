import { Severity } from './const';

export enum InternalLinks {
  Home = '/',
}

export const colorForSeverity = (severity: Severity) => {
  switch (severity) {
    case Severity.Error:
      return '#eb5a46';
    case Severity.User:
      return '#82e4fa';
    case Severity.Success:
      return '#5ac777';
    case Severity.Normal:
    default:
      return '#ffffff';
  }
};
