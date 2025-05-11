import { z, type ZodType } from "zod";

export type ZodFor<T> = ZodType<T, any, any>;

/** A basic value. */
export interface BasicValue<T extends string, V> {
  /** The kind of the value. */
  kind: T;
  value: V;
}

/** An exported value. */
export type AbiValue =
  | BasicValue<"boolean", boolean>
  | BasicValue<"string", string>
  | BasicValue<"array", AbiValue[]>
  | TupleValue
  | IntegerValue
  | StructValue;

export type TypedStructFieldValue<T> = { name: string; value: T };

export interface StructValue {
  kind: "struct";
  fields: TypedStructFieldValue<AbiValue>[];
}

export interface TupleValue {
  kind: "tuple";
  fields: AbiValue[];
}

export interface IntegerValue extends BasicValue<"integer", string> {
  sign: boolean;
}

/** Indicates whether a parameter is public or secret/private. */
export const ABIParameterVisibility = ["public", "private", "databus"] as const;

/** Indicates whether a parameter is public or secret/private. */
export type ABIParameterVisibility = (typeof ABIParameterVisibility)[number];

/** A basic type. */
export interface BasicType<T extends string> {
  /** The kind of the type. */
  kind: T;
}

/** Sign for numeric types. */
const Sign = ["unsigned", "signed"] as const;
type Sign = (typeof Sign)[number];

/** A variable type. */
export type AbiType =
  | BasicType<"field">
  | BasicType<"boolean">
  | IntegerType
  | ArrayType
  | StringType
  | StructType
  | TupleType;

export const AbiTypeSchema: z.ZodType<AbiType> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("field") }),
  z.object({ kind: z.literal("boolean") }),
  z.object({
    kind: z.literal("integer"),
    sign: z.enum(Sign),
    width: z.number(),
  }),
  z.object({
    kind: z.literal("array"),
    length: z.number(),
    type: z.lazy(() => AbiTypeSchema),
  }),
  z.object({ kind: z.literal("string"), length: z.number() }),
  z.object({
    kind: z.literal("struct"),
    fields: z.array(z.lazy(() => ABIVariableSchema)),
    path: z.string(),
  }),
  z.object({
    kind: z.literal("tuple"),
    fields: z.array(z.lazy(() => AbiTypeSchema)),
  }),
]);

/** A named type. */
export const ABIVariableSchema = z.object({
  /** The name of the variable. */
  name: z.string(),
  /** The type of the variable. */
  type: AbiTypeSchema,
});

/** A named type. */
export type ABIVariable = z.infer<typeof ABIVariableSchema>;

/** A function parameter. */
export const ABIParameterSchema = ABIVariableSchema.and(
  z.object({
    /** Visibility of the parameter in the function. */
    visibility: z.enum(ABIParameterVisibility),
  })
);

/** A function parameter. */
export type ABIParameter = z.infer<typeof ABIParameterSchema>;

/** An integer type. */
export interface IntegerType extends BasicType<"integer"> {
  /** The sign of the integer. */
  sign: Sign;
  /** The width of the integer in bits. */
  width: number;
}

/** An array type. */
export interface ArrayType extends BasicType<"array"> {
  /** The length of the array. */
  length: number;
  /** The type of the array elements. */
  type: AbiType;
}

/** A tuple type. */
export interface TupleType extends BasicType<"tuple"> {
  /** The types of the tuple elements. */
  fields: AbiType[];
}

/** A string type. */
export interface StringType extends BasicType<"string"> {
  /** The length of the string. */
  length: number;
}

/** A struct type. */
export interface StructType extends BasicType<"struct"> {
  /** The fields of the struct. */
  fields: ABIVariable[];
  /** Fully qualified name of the struct. */
  path: string;
}

/** An error could be a custom error of any regular type or a string error. */
export type AbiErrorType =
  | { error_kind: "string"; string: string }
  | { error_kind: "fmtstring"; length: number; item_types: AbiType[] }
  | ({ error_kind: "custom" } & AbiType);

const AbiErrorTypeSchema = z.union([
  z.object({ error_kind: z.literal("string"), string: z.string() }),
  z.object({
    error_kind: z.literal("fmtstring"),
    length: z.number(),
    item_types: z.array(AbiTypeSchema),
  }),
  z.object({ error_kind: z.literal("custom") }).and(AbiTypeSchema),
]) satisfies ZodFor<AbiErrorType>;

/** Aztec.nr function types. */
export enum FunctionType {
  PRIVATE = "private",
  PUBLIC = "public",
  UTILITY = "utility",
}

/** The abi entry of a function. */
export interface FunctionAbi {
  /** The name of the function. */
  name: string;
  /** Whether the function is secret. */
  functionType: FunctionType;
  /** Whether the function is internal. */
  isInternal: boolean;
  /** Whether the function can alter state or not */
  isStatic: boolean;
  /** Function parameters. */
  parameters: ABIParameter[];
  /** The types of the return values. */
  returnTypes: AbiType[];
  /** The types of the errors that the function can throw. */
  errorTypes: Partial<Record<string, AbiErrorType>>;
  /** Whether the function is flagged as an initializer. */
  isInitializer: boolean;
}

export const FunctionAbiSchema = z.object({
  name: z.string(),
  functionType: z.nativeEnum(FunctionType),
  isInternal: z.boolean(),
  isStatic: z.boolean(),
  isInitializer: z.boolean(),
  parameters: z.array(
    z.object({
      name: z.string(),
      type: AbiTypeSchema,
      visibility: z.enum(ABIParameterVisibility),
    })
  ),
  returnTypes: z.array(AbiTypeSchema),
  errorTypes: z.record(AbiErrorTypeSchema),
}) satisfies z.ZodType<FunctionAbi>;

/** Debug metadata for a function. */
export interface FunctionDebugMetadata {
  /** Maps opcodes to source code pointers */
  debugSymbols: DebugInfo;
  /** Maps the file IDs to the file contents to resolve pointers */
  files: DebugFileMap;
}

export const FunctionDebugMetadataSchema = z.object({
  debugSymbols: z.object({
    locations: z.record(
      z.array(
        z.object({
          span: z.object({ start: z.number(), end: z.number() }),
          file: z.number(),
        })
      )
    ),
    brillig_locations: z.record(
      z.record(
        z.array(
          z.object({
            span: z.object({ start: z.number(), end: z.number() }),
            file: z.number(),
          })
        )
      )
    ),
  }),
  files: z.record(z.object({ source: z.string(), path: z.string() })),
}) satisfies z.ZodType<FunctionDebugMetadata>;

/** The artifact entry of a function. */
export interface FunctionArtifact extends FunctionAbi {
  /** The ACIR bytecode of the function. */
  bytecode: Buffer;
  /** The verification key of the function, base64 encoded, if it's a private fn. */
  verificationKey?: string;
  /** Maps opcodes to source code pointers */
  debugSymbols: string;
  /** Debug metadata for the function. */
  debug?: FunctionDebugMetadata;
}

export interface FunctionArtifactWithContractName extends FunctionArtifact {
  /** The name of the contract. */
  contractName: string;
}

/** A file ID. It's assigned during compilation. */
export type FileId = number;

/** A pointer to a specific section of the source code. */
export interface SourceCodeLocation {
  /** The section of the source code. */
  span: {
    /** The byte where the section starts. */
    start: number;
    /** The byte where the section ends. */
    end: number;
  };
  /** The source code file pointed to. */
  file: FileId;
}

/**
 * The location of an opcode in the bytecode.
 * It's a string of the form `{acirIndex}` or `{acirIndex}:{brilligIndex}`.
 */
export type OpcodeLocation = string;

export type BrilligFunctionId = number;

export type OpcodeToLocationsMap = Record<OpcodeLocation, SourceCodeLocation[]>;

/** The debug information for a given function. */
export interface DebugInfo {
  /** A map of the opcode location to the source code location. */
  locations: OpcodeToLocationsMap;
  /** For each Brillig function, we have a map of the opcode location to the source code location. */
  brillig_locations: Record<BrilligFunctionId, OpcodeToLocationsMap>;
}

/** The debug information for a given program (a collection of functions) */
export interface ProgramDebugInfo {
  /** A list of debug information that matches with each function in a program */
  debug_infos: Array<DebugInfo>;
}

/** Maps a file ID to its metadata for debugging purposes. */
export type DebugFileMap = Record<
  FileId,
  {
    /** The source code of the file. */
    source: string;
    /** The path of the file. */
    path: string;
  }
>;
