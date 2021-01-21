export interface IMessage<T = Record<string, unknown>> {
  type: string;
  source: string;
  destination: string;
  payload: T;
}

export interface IKeyValue<T = string | number> {
  key: string;
  value: T;
}

export interface ILog<T = string | number> {
  action: "put";
  commited: boolean;
  timestamp: number;
  previous?: IKeyValue<T>;
  next: IKeyValue<T>;
}

export interface IWal {
  [key: string]: ILog[];
}
