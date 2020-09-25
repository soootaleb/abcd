export interface IMessage<T = Object> {
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
  timestamp: number;
  previous?: IKeyValue<T>;
  next: IKeyValue<T>;
}

export interface IWal {
  [key: string]: ILog[];
}
