function forceCast(v) {
    return v;
}
function isEmpty(value) {
    return value === null || value === undefined;
}
function isObject$1(value) {
    return value !== null && typeof value === 'object';
}
function isRecord(value) {
    return value !== null && typeof value === 'object';
}
function deepEqualsArray(a1, a2) {
    if (a1.length !== a2.length) {
        return false;
    }
    for (let i = 0; i < a1.length; i++) {
        if (a1[i] !== a2[i]) {
            return false;
        }
    }
    return true;
}
function deepMerge(r1, r2) {
    const keys = Array.from(new Set([...Object.keys(r1), ...Object.keys(r2)]));
    return keys.reduce((result, key) => {
        const v1 = r1[key];
        const v2 = r2[key];
        return isRecord(v1) && isRecord(v2)
            ? Object.assign(Object.assign({}, result), { [key]: deepMerge(v1, v2) }) : Object.assign(Object.assign({}, result), { [key]: key in r2 ? v2 : v1 });
    }, {});
}

function isBinding(value) {
    if (!isObject$1(value)) {
        return false;
    }
    return 'target' in value;
}

const CREATE_MESSAGE_MAP = {
    alreadydisposed: () => 'View has been already disposed',
    invalidparams: (context) => `Invalid parameters for '${context.name}'`,
    nomatchingcontroller: (context) => `No matching controller for '${context.key}'`,
    nomatchingview: (context) => `No matching view for '${JSON.stringify(context.params)}'`,
    notbindable: () => `Value is not bindable`,
    notcompatible: (context) => `Not compatible with  plugin '${context.id}'`,
    propertynotfound: (context) => `Property '${context.name}' not found`,
    shouldneverhappen: () => 'This error should never happen',
};
class TpError {
    static alreadyDisposed() {
        return new TpError({ type: 'alreadydisposed' });
    }
    static notBindable() {
        return new TpError({
            type: 'notbindable',
        });
    }
    static notCompatible(bundleId, id) {
        return new TpError({
            type: 'notcompatible',
            context: {
                id: `${bundleId}.${id}`,
            },
        });
    }
    static propertyNotFound(name) {
        return new TpError({
            type: 'propertynotfound',
            context: {
                name: name,
            },
        });
    }
    static shouldNeverHappen() {
        return new TpError({ type: 'shouldneverhappen' });
    }
    constructor(config) {
        var _a;
        this.message =
            (_a = CREATE_MESSAGE_MAP[config.type](forceCast(config.context))) !== null && _a !== void 0 ? _a : 'Unexpected error';
        this.name = this.constructor.name;
        this.stack = new Error(this.message).stack;
        this.type = config.type;
    }
    toString() {
        return this.message;
    }
}

class BindingTarget {
    constructor(obj, key) {
        this.obj_ = obj;
        this.key = key;
    }
    static isBindable(obj) {
        if (obj === null) {
            return false;
        }
        if (typeof obj !== 'object' && typeof obj !== 'function') {
            return false;
        }
        return true;
    }
    read() {
        return this.obj_[this.key];
    }
    write(value) {
        this.obj_[this.key] = value;
    }
    writeProperty(name, value) {
        const valueObj = this.read();
        if (!BindingTarget.isBindable(valueObj)) {
            throw TpError.notBindable();
        }
        if (!(name in valueObj)) {
            throw TpError.propertyNotFound(name);
        }
        valueObj[name] = value;
    }
}

class Emitter {
    constructor() {
        this.observers_ = {};
    }
    on(eventName, handler, opt_options) {
        var _a;
        let observers = this.observers_[eventName];
        if (!observers) {
            observers = this.observers_[eventName] = [];
        }
        observers.push({
            handler: handler,
            key: (_a = opt_options === null || opt_options === void 0 ? void 0 : opt_options.key) !== null && _a !== void 0 ? _a : handler,
        });
        return this;
    }
    off(eventName, key) {
        const observers = this.observers_[eventName];
        if (observers) {
            this.observers_[eventName] = observers.filter((observer) => {
                return observer.key !== key;
            });
        }
        return this;
    }
    emit(eventName, event) {
        const observers = this.observers_[eventName];
        if (!observers) {
            return;
        }
        observers.forEach((observer) => {
            observer.handler(event);
        });
    }
}

class ComplexValue {
    constructor(initialValue, config) {
        var _a;
        this.constraint_ = config === null || config === void 0 ? void 0 : config.constraint;
        this.equals_ = (_a = config === null || config === void 0 ? void 0 : config.equals) !== null && _a !== void 0 ? _a : ((v1, v2) => v1 === v2);
        this.emitter = new Emitter();
        this.rawValue_ = initialValue;
    }
    get constraint() {
        return this.constraint_;
    }
    get rawValue() {
        return this.rawValue_;
    }
    set rawValue(rawValue) {
        this.setRawValue(rawValue, {
            forceEmit: false,
            last: true,
        });
    }
    setRawValue(rawValue, options) {
        const opts = options !== null && options !== void 0 ? options : {
            forceEmit: false,
            last: true,
        };
        const constrainedValue = this.constraint_
            ? this.constraint_.constrain(rawValue)
            : rawValue;
        const prevValue = this.rawValue_;
        const changed = !this.equals_(prevValue, constrainedValue);
        if (!changed && !opts.forceEmit) {
            return;
        }
        this.emitter.emit('beforechange', {
            sender: this,
        });
        this.rawValue_ = constrainedValue;
        this.emitter.emit('change', {
            options: opts,
            previousRawValue: prevValue,
            rawValue: constrainedValue,
            sender: this,
        });
    }
}

class PrimitiveValue {
    constructor(initialValue) {
        this.emitter = new Emitter();
        this.value_ = initialValue;
    }
    get rawValue() {
        return this.value_;
    }
    set rawValue(value) {
        this.setRawValue(value, {
            forceEmit: false,
            last: true,
        });
    }
    setRawValue(value, options) {
        const opts = options !== null && options !== void 0 ? options : {
            forceEmit: false,
            last: true,
        };
        const prevValue = this.value_;
        if (prevValue === value && !opts.forceEmit) {
            return;
        }
        this.emitter.emit('beforechange', {
            sender: this,
        });
        this.value_ = value;
        this.emitter.emit('change', {
            options: opts,
            previousRawValue: prevValue,
            rawValue: this.value_,
            sender: this,
        });
    }
}

class ReadonlyPrimitiveValue {
    constructor(value) {
        this.emitter = new Emitter();
        this.onValueBeforeChange_ = this.onValueBeforeChange_.bind(this);
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.value_ = value;
        this.value_.emitter.on('beforechange', this.onValueBeforeChange_);
        this.value_.emitter.on('change', this.onValueChange_);
    }
    get rawValue() {
        return this.value_.rawValue;
    }
    onValueBeforeChange_(ev) {
        this.emitter.emit('beforechange', Object.assign(Object.assign({}, ev), { sender: this }));
    }
    onValueChange_(ev) {
        this.emitter.emit('change', Object.assign(Object.assign({}, ev), { sender: this }));
    }
}

function createValue(initialValue, config) {
    const constraint = config === null || config === void 0 ? void 0 : config.constraint;
    const equals = config === null || config === void 0 ? void 0 : config.equals;
    if (!constraint && !equals) {
        return new PrimitiveValue(initialValue);
    }
    return new ComplexValue(initialValue, config);
}
function createReadonlyValue(value) {
    return [
        new ReadonlyPrimitiveValue(value),
        (rawValue, options) => {
            value.setRawValue(rawValue, options);
        },
    ];
}

class ValueMap {
    constructor(valueMap) {
        this.emitter = new Emitter();
        this.valMap_ = valueMap;
        for (const key in this.valMap_) {
            const v = this.valMap_[key];
            v.emitter.on('change', () => {
                this.emitter.emit('change', {
                    key: key,
                    sender: this,
                });
            });
        }
    }
    static createCore(initialValue) {
        const keys = Object.keys(initialValue);
        return keys.reduce((o, key) => {
            return Object.assign(o, {
                [key]: createValue(initialValue[key]),
            });
        }, {});
    }
    static fromObject(initialValue) {
        const core = this.createCore(initialValue);
        return new ValueMap(core);
    }
    get(key) {
        return this.valMap_[key].rawValue;
    }
    set(key, value) {
        this.valMap_[key].rawValue = value;
    }
    value(key) {
        return this.valMap_[key];
    }
}

class DefiniteRangeConstraint {
    constructor(config) {
        this.values = ValueMap.fromObject({
            max: config.max,
            min: config.min,
        });
    }
    constrain(value) {
        const max = this.values.get('max');
        const min = this.values.get('min');
        return Math.min(Math.max(value, min), max);
    }
}

class RangeConstraint {
    constructor(config) {
        this.values = ValueMap.fromObject({
            max: config.max,
            min: config.min,
        });
    }
    constrain(value) {
        const max = this.values.get('max');
        const min = this.values.get('min');
        let result = value;
        if (!isEmpty(min)) {
            result = Math.max(result, min);
        }
        if (!isEmpty(max)) {
            result = Math.min(result, max);
        }
        return result;
    }
}

class StepConstraint {
    constructor(step, origin = 0) {
        this.step = step;
        this.origin = origin;
    }
    constrain(value) {
        const o = this.origin % this.step;
        const r = Math.round((value - o) / this.step);
        return o + r * this.step;
    }
}

class NumberLiteralNode {
    constructor(text) {
        this.text = text;
    }
    evaluate() {
        return Number(this.text);
    }
    toString() {
        return this.text;
    }
}
const BINARY_OPERATION_MAP = {
    '**': (v1, v2) => Math.pow(v1, v2),
    '*': (v1, v2) => v1 * v2,
    '/': (v1, v2) => v1 / v2,
    '%': (v1, v2) => v1 % v2,
    '+': (v1, v2) => v1 + v2,
    '-': (v1, v2) => v1 - v2,
    '<<': (v1, v2) => v1 << v2,
    '>>': (v1, v2) => v1 >> v2,
    '>>>': (v1, v2) => v1 >>> v2,
    '&': (v1, v2) => v1 & v2,
    '^': (v1, v2) => v1 ^ v2,
    '|': (v1, v2) => v1 | v2,
};
class BinaryOperationNode {
    constructor(operator, left, right) {
        this.left = left;
        this.operator = operator;
        this.right = right;
    }
    evaluate() {
        const op = BINARY_OPERATION_MAP[this.operator];
        if (!op) {
            throw new Error(`unexpected binary operator: '${this.operator}`);
        }
        return op(this.left.evaluate(), this.right.evaluate());
    }
    toString() {
        return [
            'b(',
            this.left.toString(),
            this.operator,
            this.right.toString(),
            ')',
        ].join(' ');
    }
}
const UNARY_OPERATION_MAP = {
    '+': (v) => v,
    '-': (v) => -v,
    '~': (v) => ~v,
};
class UnaryOperationNode {
    constructor(operator, expr) {
        this.operator = operator;
        this.expression = expr;
    }
    evaluate() {
        const op = UNARY_OPERATION_MAP[this.operator];
        if (!op) {
            throw new Error(`unexpected unary operator: '${this.operator}`);
        }
        return op(this.expression.evaluate());
    }
    toString() {
        return ['u(', this.operator, this.expression.toString(), ')'].join(' ');
    }
}

function combineReader(parsers) {
    return (text, cursor) => {
        for (let i = 0; i < parsers.length; i++) {
            const result = parsers[i](text, cursor);
            if (result !== '') {
                return result;
            }
        }
        return '';
    };
}
function readWhitespace(text, cursor) {
    var _a;
    const m = text.substr(cursor).match(/^\s+/);
    return (_a = (m && m[0])) !== null && _a !== void 0 ? _a : '';
}
function readNonZeroDigit(text, cursor) {
    const ch = text.substr(cursor, 1);
    return ch.match(/^[1-9]$/) ? ch : '';
}
function readDecimalDigits(text, cursor) {
    var _a;
    const m = text.substr(cursor).match(/^[0-9]+/);
    return (_a = (m && m[0])) !== null && _a !== void 0 ? _a : '';
}
function readSignedInteger(text, cursor) {
    const ds = readDecimalDigits(text, cursor);
    if (ds !== '') {
        return ds;
    }
    const sign = text.substr(cursor, 1);
    cursor += 1;
    if (sign !== '-' && sign !== '+') {
        return '';
    }
    const sds = readDecimalDigits(text, cursor);
    if (sds === '') {
        return '';
    }
    return sign + sds;
}
function readExponentPart(text, cursor) {
    const e = text.substr(cursor, 1);
    cursor += 1;
    if (e.toLowerCase() !== 'e') {
        return '';
    }
    const si = readSignedInteger(text, cursor);
    if (si === '') {
        return '';
    }
    return e + si;
}
function readDecimalIntegerLiteral(text, cursor) {
    const ch = text.substr(cursor, 1);
    if (ch === '0') {
        return ch;
    }
    const nzd = readNonZeroDigit(text, cursor);
    cursor += nzd.length;
    if (nzd === '') {
        return '';
    }
    return nzd + readDecimalDigits(text, cursor);
}
function readDecimalLiteral1(text, cursor) {
    const dil = readDecimalIntegerLiteral(text, cursor);
    cursor += dil.length;
    if (dil === '') {
        return '';
    }
    const dot = text.substr(cursor, 1);
    cursor += dot.length;
    if (dot !== '.') {
        return '';
    }
    const dds = readDecimalDigits(text, cursor);
    cursor += dds.length;
    return dil + dot + dds + readExponentPart(text, cursor);
}
function readDecimalLiteral2(text, cursor) {
    const dot = text.substr(cursor, 1);
    cursor += dot.length;
    if (dot !== '.') {
        return '';
    }
    const dds = readDecimalDigits(text, cursor);
    cursor += dds.length;
    if (dds === '') {
        return '';
    }
    return dot + dds + readExponentPart(text, cursor);
}
function readDecimalLiteral3(text, cursor) {
    const dil = readDecimalIntegerLiteral(text, cursor);
    cursor += dil.length;
    if (dil === '') {
        return '';
    }
    return dil + readExponentPart(text, cursor);
}
const readDecimalLiteral = combineReader([
    readDecimalLiteral1,
    readDecimalLiteral2,
    readDecimalLiteral3,
]);
function parseBinaryDigits(text, cursor) {
    var _a;
    const m = text.substr(cursor).match(/^[01]+/);
    return (_a = (m && m[0])) !== null && _a !== void 0 ? _a : '';
}
function readBinaryIntegerLiteral(text, cursor) {
    const prefix = text.substr(cursor, 2);
    cursor += prefix.length;
    if (prefix.toLowerCase() !== '0b') {
        return '';
    }
    const bds = parseBinaryDigits(text, cursor);
    if (bds === '') {
        return '';
    }
    return prefix + bds;
}
function readOctalDigits(text, cursor) {
    var _a;
    const m = text.substr(cursor).match(/^[0-7]+/);
    return (_a = (m && m[0])) !== null && _a !== void 0 ? _a : '';
}
function readOctalIntegerLiteral(text, cursor) {
    const prefix = text.substr(cursor, 2);
    cursor += prefix.length;
    if (prefix.toLowerCase() !== '0o') {
        return '';
    }
    const ods = readOctalDigits(text, cursor);
    if (ods === '') {
        return '';
    }
    return prefix + ods;
}
function readHexDigits(text, cursor) {
    var _a;
    const m = text.substr(cursor).match(/^[0-9a-f]+/i);
    return (_a = (m && m[0])) !== null && _a !== void 0 ? _a : '';
}
function readHexIntegerLiteral(text, cursor) {
    const prefix = text.substr(cursor, 2);
    cursor += prefix.length;
    if (prefix.toLowerCase() !== '0x') {
        return '';
    }
    const hds = readHexDigits(text, cursor);
    if (hds === '') {
        return '';
    }
    return prefix + hds;
}
const readNonDecimalIntegerLiteral = combineReader([
    readBinaryIntegerLiteral,
    readOctalIntegerLiteral,
    readHexIntegerLiteral,
]);
const readNumericLiteral = combineReader([
    readNonDecimalIntegerLiteral,
    readDecimalLiteral,
]);

function parseLiteral(text, cursor) {
    const num = readNumericLiteral(text, cursor);
    cursor += num.length;
    if (num === '') {
        return null;
    }
    return {
        evaluable: new NumberLiteralNode(num),
        cursor: cursor,
    };
}
function parseParenthesizedExpression(text, cursor) {
    const op = text.substr(cursor, 1);
    cursor += op.length;
    if (op !== '(') {
        return null;
    }
    const expr = parseExpression(text, cursor);
    if (!expr) {
        return null;
    }
    cursor = expr.cursor;
    cursor += readWhitespace(text, cursor).length;
    const cl = text.substr(cursor, 1);
    cursor += cl.length;
    if (cl !== ')') {
        return null;
    }
    return {
        evaluable: expr.evaluable,
        cursor: cursor,
    };
}
function parsePrimaryExpression(text, cursor) {
    var _a;
    return ((_a = parseLiteral(text, cursor)) !== null && _a !== void 0 ? _a : parseParenthesizedExpression(text, cursor));
}
function parseUnaryExpression(text, cursor) {
    const expr = parsePrimaryExpression(text, cursor);
    if (expr) {
        return expr;
    }
    const op = text.substr(cursor, 1);
    cursor += op.length;
    if (op !== '+' && op !== '-' && op !== '~') {
        return null;
    }
    const num = parseUnaryExpression(text, cursor);
    if (!num) {
        return null;
    }
    cursor = num.cursor;
    return {
        cursor: cursor,
        evaluable: new UnaryOperationNode(op, num.evaluable),
    };
}
function readBinaryOperator(ops, text, cursor) {
    cursor += readWhitespace(text, cursor).length;
    const op = ops.filter((op) => text.startsWith(op, cursor))[0];
    if (!op) {
        return null;
    }
    cursor += op.length;
    cursor += readWhitespace(text, cursor).length;
    return {
        cursor: cursor,
        operator: op,
    };
}
function createBinaryOperationExpressionParser(exprParser, ops) {
    return (text, cursor) => {
        const firstExpr = exprParser(text, cursor);
        if (!firstExpr) {
            return null;
        }
        cursor = firstExpr.cursor;
        let expr = firstExpr.evaluable;
        for (;;) {
            const op = readBinaryOperator(ops, text, cursor);
            if (!op) {
                break;
            }
            cursor = op.cursor;
            const nextExpr = exprParser(text, cursor);
            if (!nextExpr) {
                return null;
            }
            cursor = nextExpr.cursor;
            expr = new BinaryOperationNode(op.operator, expr, nextExpr.evaluable);
        }
        return expr
            ? {
                cursor: cursor,
                evaluable: expr,
            }
            : null;
    };
}
const parseBinaryOperationExpression = [
    ['**'],
    ['*', '/', '%'],
    ['+', '-'],
    ['<<', '>>>', '>>'],
    ['&'],
    ['^'],
    ['|'],
].reduce((parser, ops) => {
    return createBinaryOperationExpressionParser(parser, ops);
}, parseUnaryExpression);
function parseExpression(text, cursor) {
    cursor += readWhitespace(text, cursor).length;
    return parseBinaryOperationExpression(text, cursor);
}
function parseEcmaNumberExpression(text) {
    const expr = parseExpression(text, 0);
    if (!expr) {
        return null;
    }
    const cursor = expr.cursor + readWhitespace(text, expr.cursor).length;
    if (cursor !== text.length) {
        return null;
    }
    return expr.evaluable;
}

function parseNumber(text) {
    var _a;
    const r = parseEcmaNumberExpression(text);
    return (_a = r === null || r === void 0 ? void 0 : r.evaluate()) !== null && _a !== void 0 ? _a : null;
}
function numberFromUnknown(value) {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        const pv = parseNumber(value);
        if (!isEmpty(pv)) {
            return pv;
        }
    }
    return 0;
}
function createNumberFormatter(digits) {
    return (value) => {
        return value.toFixed(Math.max(Math.min(digits, 20), 0));
    };
}

function mapRange$1(value, start1, end1, start2, end2) {
    const p = (value - start1) / (end1 - start1);
    return start2 + p * (end2 - start2);
}
function getDecimalDigits(value) {
    const text = String(value.toFixed(10));
    const frac = text.split('.')[1];
    return frac.replace(/0+$/, '').length;
}
function constrainRange(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function loopRange(value, max) {
    return ((value % max) + max) % max;
}
function getSuitableDecimalDigits(params, rawValue) {
    return !isEmpty(params.step)
        ? getDecimalDigits(params.step)
        : Math.max(getDecimalDigits(rawValue), 2);
}
function getSuitableKeyScale(params) {
    var _a;
    return (_a = params.step) !== null && _a !== void 0 ? _a : 1;
}
function getSuitablePointerScale(params, rawValue) {
    var _a;
    const base = Math.abs((_a = params.step) !== null && _a !== void 0 ? _a : rawValue);
    return base === 0 ? 0.1 : Math.pow(10, Math.floor(Math.log10(base)) - 1);
}
function createStepConstraint(params, initialValue) {
    if (!isEmpty(params.step)) {
        return new StepConstraint(params.step, initialValue);
    }
    return null;
}
function createRangeConstraint(params) {
    if (!isEmpty(params.max) && !isEmpty(params.min)) {
        return new DefiniteRangeConstraint({
            max: params.max,
            min: params.min,
        });
    }
    if (!isEmpty(params.max) || !isEmpty(params.min)) {
        return new RangeConstraint({
            max: params.max,
            min: params.min,
        });
    }
    return null;
}
function createNumberTextPropsObject(params, initialValue) {
    var _a, _b, _c;
    return {
        formatter: (_a = params.format) !== null && _a !== void 0 ? _a : createNumberFormatter(getSuitableDecimalDigits(params, initialValue)),
        keyScale: (_b = params.keyScale) !== null && _b !== void 0 ? _b : getSuitableKeyScale(params),
        pointerScale: (_c = params.pointerScale) !== null && _c !== void 0 ? _c : getSuitablePointerScale(params, initialValue),
    };
}
function createNumberTextInputParamsParser(p) {
    return {
        format: p.optional.function,
        keyScale: p.optional.number,
        max: p.optional.number,
        min: p.optional.number,
        pointerScale: p.optional.number,
        step: p.optional.number,
    };
}

function createPointAxis(config) {
    return {
        constraint: config.constraint,
        textProps: ValueMap.fromObject(createNumberTextPropsObject(config.params, config.initialValue)),
    };
}

class BladeApi {
    constructor(controller) {
        this.controller = controller;
    }
    get element() {
        return this.controller.view.element;
    }
    get disabled() {
        return this.controller.viewProps.get('disabled');
    }
    set disabled(disabled) {
        this.controller.viewProps.set('disabled', disabled);
    }
    get hidden() {
        return this.controller.viewProps.get('hidden');
    }
    set hidden(hidden) {
        this.controller.viewProps.set('hidden', hidden);
    }
    dispose() {
        this.controller.viewProps.set('disposed', true);
    }
    importState(state) {
        return this.controller.importState(state);
    }
    exportState() {
        return this.controller.exportState();
    }
}

class TpEvent {
    constructor(target) {
        this.target = target;
    }
}
class TpChangeEvent extends TpEvent {
    constructor(target, value, last) {
        super(target);
        this.value = value;
        this.last = last !== null && last !== void 0 ? last : true;
    }
}
class TpFoldEvent extends TpEvent {
    constructor(target, expanded) {
        super(target);
        this.expanded = expanded;
    }
}
class TpTabSelectEvent extends TpEvent {
    constructor(target, index) {
        super(target);
        this.index = index;
    }
}
class TpMouseEvent extends TpEvent {
    constructor(target, nativeEvent) {
        super(target);
        this.native = nativeEvent;
    }
}

class BindingApi extends BladeApi {
    constructor(controller) {
        super(controller);
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.emitter_ = new Emitter();
        this.controller.value.emitter.on('change', this.onValueChange_);
    }
    get label() {
        return this.controller.labelController.props.get('label');
    }
    set label(label) {
        this.controller.labelController.props.set('label', label);
    }
    get key() {
        return this.controller.value.binding.target.key;
    }
    get tag() {
        return this.controller.tag;
    }
    set tag(tag) {
        this.controller.tag = tag;
    }
    on(eventName, handler) {
        const bh = handler.bind(this);
        this.emitter_.on(eventName, (ev) => {
            bh(ev);
        }, {
            key: handler,
        });
        return this;
    }
    off(eventName, handler) {
        this.emitter_.off(eventName, handler);
        return this;
    }
    refresh() {
        this.controller.value.fetch();
    }
    onValueChange_(ev) {
        const value = this.controller.value;
        this.emitter_.emit('change', new TpChangeEvent(this, forceCast(value.binding.target.read()), ev.options.last));
    }
}

function parseObject(value, keyToParserMap) {
    const keys = Object.keys(keyToParserMap);
    const result = keys.reduce((tmp, key) => {
        if (tmp === undefined) {
            return undefined;
        }
        const parser = keyToParserMap[key];
        const result = parser(value[key]);
        return result.succeeded
            ? Object.assign(Object.assign({}, tmp), { [key]: result.value }) : undefined;
    }, {});
    return forceCast(result);
}
function parseArray(value, parseItem) {
    return value.reduce((tmp, item) => {
        if (tmp === undefined) {
            return undefined;
        }
        const result = parseItem(item);
        if (!result.succeeded || result.value === undefined) {
            return undefined;
        }
        return [...tmp, result.value];
    }, []);
}
function isObject(value) {
    if (value === null) {
        return false;
    }
    return typeof value === 'object';
}
function createMicroParserBuilder(parse) {
    return (optional) => (v) => {
        if (!optional && v === undefined) {
            return {
                succeeded: false,
                value: undefined,
            };
        }
        if (optional && v === undefined) {
            return {
                succeeded: true,
                value: undefined,
            };
        }
        const result = parse(v);
        return result !== undefined
            ? {
                succeeded: true,
                value: result,
            }
            : {
                succeeded: false,
                value: undefined,
            };
    };
}
function createMicroParserBuilders(optional) {
    return {
        custom: (parse) => createMicroParserBuilder(parse)(optional),
        boolean: createMicroParserBuilder((v) => typeof v === 'boolean' ? v : undefined)(optional),
        number: createMicroParserBuilder((v) => typeof v === 'number' ? v : undefined)(optional),
        string: createMicroParserBuilder((v) => typeof v === 'string' ? v : undefined)(optional),
        function: createMicroParserBuilder((v) =>
        typeof v === 'function' ? v : undefined)(optional),
        constant: (value) => createMicroParserBuilder((v) => (v === value ? value : undefined))(optional),
        raw: createMicroParserBuilder((v) => v)(optional),
        object: (keyToParserMap) => createMicroParserBuilder((v) => {
            if (!isObject(v)) {
                return undefined;
            }
            return parseObject(v, keyToParserMap);
        })(optional),
        array: (itemParser) => createMicroParserBuilder((v) => {
            if (!Array.isArray(v)) {
                return undefined;
            }
            return parseArray(v, itemParser);
        })(optional),
    };
}
const MicroParsers = {
    optional: createMicroParserBuilders(true),
    required: createMicroParserBuilders(false),
};
function parseRecord(value, keyToParserMap) {
    const map = keyToParserMap(MicroParsers);
    const result = MicroParsers.required.object(map)(value);
    return result.succeeded ? result.value : undefined;
}

function importBladeState(state, superImport, parser, callback) {
    if (superImport && !superImport(state)) {
        return false;
    }
    const result = parseRecord(state, parser);
    return result ? callback(result) : false;
}
function exportBladeState(superExport, thisState) {
    var _a;
    return deepMerge((_a = superExport === null || superExport === void 0 ? void 0 : superExport()) !== null && _a !== void 0 ? _a : {}, thisState);
}

function isValueBladeController(bc) {
    return 'value' in bc;
}

function isBindingValue(v) {
    if (!isObject$1(v) || !('binding' in v)) {
        return false;
    }
    const b = v.binding;
    return isBinding(b);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function forceReflow(element) {
    element.offsetHeight;
}
function disableTransitionTemporarily(element, callback) {
    const t = element.style.transition;
    element.style.transition = 'none';
    callback();
    element.style.transition = t;
}
function supportsTouch(doc) {
    return doc.ontouchstart !== undefined;
}
function getCanvasContext(canvasElement) {
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) {
        return null;
    }
    const isBrowser = 'document' in win;
    return isBrowser
        ? canvasElement.getContext('2d', {
            willReadFrequently: true,
        })
        : null;
}
const ICON_ID_TO_INNER_HTML_MAP = {
    check: '<path d="M2 8l4 4l8 -8"/>',
    dropdown: '<path d="M5 7h6l-3 3 z"/>',
    p2dpad: '<path d="M8 4v8"/><path d="M4 8h8"/><circle cx="12" cy="12" r="1.2"/>',
};
function createSvgIconElement(document, iconId) {
    const elem = document.createElementNS(SVG_NS, 'svg');
    elem.innerHTML = ICON_ID_TO_INNER_HTML_MAP[iconId];
    return elem;
}
function insertElementAt(parentElement, element, index) {
    parentElement.insertBefore(element, parentElement.children[index]);
}
function removeElement(element) {
    if (element.parentElement) {
        element.parentElement.removeChild(element);
    }
}
function removeChildElements(element) {
    while (element.children.length > 0) {
        element.removeChild(element.children[0]);
    }
}
function removeChildNodes(element) {
    while (element.childNodes.length > 0) {
        element.removeChild(element.childNodes[0]);
    }
}
function findNextTarget(ev) {
    if (ev.relatedTarget) {
        return forceCast(ev.relatedTarget);
    }
    if ('explicitOriginalTarget' in ev) {
        return ev.explicitOriginalTarget;
    }
    return null;
}

function bindValue(value, applyValue) {
    value.emitter.on('change', (ev) => {
        applyValue(ev.rawValue);
    });
    applyValue(value.rawValue);
}
function bindValueMap(valueMap, key, applyValue) {
    bindValue(valueMap.value(key), applyValue);
}

const PREFIX = 'tp';
function ClassName(viewName) {
    const fn = (opt_elementName, opt_modifier) => {
        return [
            PREFIX,
            '-',
            viewName,
            'v',
            opt_elementName ? `_${opt_elementName}` : '',
            opt_modifier ? `-${opt_modifier}` : '',
        ].join('');
    };
    return fn;
}

const cn$s = ClassName('lbl');
function createLabelNode(doc, label) {
    const frag = doc.createDocumentFragment();
    const lineNodes = label.split('\n').map((line) => {
        return doc.createTextNode(line);
    });
    lineNodes.forEach((lineNode, index) => {
        if (index > 0) {
            frag.appendChild(doc.createElement('br'));
        }
        frag.appendChild(lineNode);
    });
    return frag;
}
class LabelView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$s());
        config.viewProps.bindClassModifiers(this.element);
        const labelElem = doc.createElement('div');
        labelElem.classList.add(cn$s('l'));
        bindValueMap(config.props, 'label', (value) => {
            if (isEmpty(value)) {
                this.element.classList.add(cn$s(undefined, 'nol'));
            }
            else {
                this.element.classList.remove(cn$s(undefined, 'nol'));
                removeChildNodes(labelElem);
                labelElem.appendChild(createLabelNode(doc, value));
            }
        });
        this.element.appendChild(labelElem);
        this.labelElement = labelElem;
        const valueElem = doc.createElement('div');
        valueElem.classList.add(cn$s('v'));
        this.element.appendChild(valueElem);
        this.valueElement = valueElem;
    }
}

class LabelController {
    constructor(doc, config) {
        this.props = config.props;
        this.valueController = config.valueController;
        this.viewProps = config.valueController.viewProps;
        this.view = new LabelView(doc, {
            props: config.props,
            viewProps: this.viewProps,
        });
        this.view.valueElement.appendChild(this.valueController.view.element);
    }
    importProps(state) {
        return importBladeState(state, null, (p) => ({
            label: p.optional.string,
        }), (result) => {
            this.props.set('label', result.label);
            return true;
        });
    }
    exportProps() {
        return exportBladeState(null, {
            label: this.props.get('label'),
        });
    }
}

function getAllBladePositions() {
    return ['veryfirst', 'first', 'last', 'verylast'];
}

const cn$r = ClassName('');
const POS_TO_CLASS_NAME_MAP = {
    veryfirst: 'vfst',
    first: 'fst',
    last: 'lst',
    verylast: 'vlst',
};
class BladeController {
    constructor(config) {
        this.parent_ = null;
        this.blade = config.blade;
        this.view = config.view;
        this.viewProps = config.viewProps;
        const elem = this.view.element;
        this.blade.value('positions').emitter.on('change', () => {
            getAllBladePositions().forEach((pos) => {
                elem.classList.remove(cn$r(undefined, POS_TO_CLASS_NAME_MAP[pos]));
            });
            this.blade.get('positions').forEach((pos) => {
                elem.classList.add(cn$r(undefined, POS_TO_CLASS_NAME_MAP[pos]));
            });
        });
        this.viewProps.handleDispose(() => {
            removeElement(elem);
        });
    }
    get parent() {
        return this.parent_;
    }
    set parent(parent) {
        this.parent_ = parent;
        this.viewProps.set('parent', this.parent_ ? this.parent_.viewProps : null);
    }
    importState(state) {
        return importBladeState(state, null, (p) => ({
            disabled: p.required.boolean,
            hidden: p.required.boolean,
        }), (result) => {
            this.viewProps.importState(result);
            return true;
        });
    }
    exportState() {
        return exportBladeState(null, Object.assign({}, this.viewProps.exportState()));
    }
}

class ButtonApi extends BladeApi {
    get label() {
        return this.controller.labelController.props.get('label');
    }
    set label(label) {
        this.controller.labelController.props.set('label', label);
    }
    get title() {
        var _a;
        return (_a = this.controller.buttonController.props.get('title')) !== null && _a !== void 0 ? _a : '';
    }
    set title(title) {
        this.controller.buttonController.props.set('title', title);
    }
    on(eventName, handler) {
        const bh = handler.bind(this);
        const emitter = this.controller.buttonController.emitter;
        emitter.on(eventName, (ev) => {
            bh(new TpMouseEvent(this, ev.nativeEvent));
        });
        return this;
    }
    off(eventName, handler) {
        const emitter = this.controller.buttonController.emitter;
        emitter.off(eventName, handler);
        return this;
    }
}

function applyClass(elem, className, active) {
    if (active) {
        elem.classList.add(className);
    }
    else {
        elem.classList.remove(className);
    }
}
function valueToClassName(elem, className) {
    return (value) => {
        applyClass(elem, className, value);
    };
}
function bindValueToTextContent(value, elem) {
    bindValue(value, (text) => {
        elem.textContent = text !== null && text !== void 0 ? text : '';
    });
}

const cn$q = ClassName('btn');
class ButtonView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$q());
        config.viewProps.bindClassModifiers(this.element);
        const buttonElem = doc.createElement('button');
        buttonElem.classList.add(cn$q('b'));
        config.viewProps.bindDisabled(buttonElem);
        this.element.appendChild(buttonElem);
        this.buttonElement = buttonElem;
        const titleElem = doc.createElement('div');
        titleElem.classList.add(cn$q('t'));
        bindValueToTextContent(config.props.value('title'), titleElem);
        this.buttonElement.appendChild(titleElem);
    }
}

class ButtonController {
    constructor(doc, config) {
        this.emitter = new Emitter();
        this.onClick_ = this.onClick_.bind(this);
        this.props = config.props;
        this.viewProps = config.viewProps;
        this.view = new ButtonView(doc, {
            props: this.props,
            viewProps: this.viewProps,
        });
        this.view.buttonElement.addEventListener('click', this.onClick_);
    }
    importProps(state) {
        return importBladeState(state, null, (p) => ({
            title: p.optional.string,
        }), (result) => {
            this.props.set('title', result.title);
            return true;
        });
    }
    exportProps() {
        return exportBladeState(null, {
            title: this.props.get('title'),
        });
    }
    onClick_(ev) {
        this.emitter.emit('click', {
            nativeEvent: ev,
            sender: this,
        });
    }
}

class ButtonBladeController extends BladeController {
    constructor(doc, config) {
        const bc = new ButtonController(doc, {
            props: config.buttonProps,
            viewProps: config.viewProps,
        });
        const lc = new LabelController(doc, {
            blade: config.blade,
            props: config.labelProps,
            valueController: bc,
        });
        super({
            blade: config.blade,
            view: lc.view,
            viewProps: config.viewProps,
        });
        this.buttonController = bc;
        this.labelController = lc;
    }
    importState(state) {
        return importBladeState(state, (s) => super.importState(s) &&
            this.buttonController.importProps(s) &&
            this.labelController.importProps(s), () => ({}), () => true);
    }
    exportState() {
        return exportBladeState(() => super.exportState(), Object.assign(Object.assign({}, this.buttonController.exportProps()), this.labelController.exportProps()));
    }
}

class Semver {
    constructor(text) {
        const [core, prerelease] = text.split('-');
        const coreComps = core.split('.');
        this.major = parseInt(coreComps[0], 10);
        this.minor = parseInt(coreComps[1], 10);
        this.patch = parseInt(coreComps[2], 10);
        this.prerelease = prerelease !== null && prerelease !== void 0 ? prerelease : null;
    }
    toString() {
        const core = [this.major, this.minor, this.patch].join('.');
        return this.prerelease !== null ? [core, this.prerelease].join('-') : core;
    }
}

const VERSION = new Semver('2.0.5');

function createPlugin(plugin) {
    return Object.assign({ core: VERSION }, plugin);
}

createPlugin({
    id: 'button',
    type: 'blade',
    accept(params) {
        const result = parseRecord(params, (p) => ({
            title: p.required.string,
            view: p.required.constant('button'),
            label: p.optional.string,
        }));
        return result ? { params: result } : null;
    },
    controller(args) {
        return new ButtonBladeController(args.document, {
            blade: args.blade,
            buttonProps: ValueMap.fromObject({
                title: args.params.title,
            }),
            labelProps: ValueMap.fromObject({
                label: args.params.label,
            }),
            viewProps: args.viewProps,
        });
    },
    api(args) {
        if (args.controller instanceof ButtonBladeController) {
            return new ButtonApi(args.controller);
        }
        return null;
    },
});

function addButtonAsBlade(api, params) {
    return api.addBlade(Object.assign(Object.assign({}, params), { view: 'button' }));
}
function addFolderAsBlade(api, params) {
    return api.addBlade(Object.assign(Object.assign({}, params), { view: 'folder' }));
}
function addTabAsBlade(api, params) {
    return api.addBlade(Object.assign(Object.assign({}, params), { view: 'tab' }));
}

function isRefreshable(value) {
    if (!isObject$1(value)) {
        return false;
    }
    return 'refresh' in value && typeof value.refresh === 'function';
}

function createBindingTarget(obj, key) {
    if (!BindingTarget.isBindable(obj)) {
        throw TpError.notBindable();
    }
    return new BindingTarget(obj, key);
}
class RackApi {
    constructor(controller, pool) {
        this.onRackValueChange_ = this.onRackValueChange_.bind(this);
        this.controller_ = controller;
        this.emitter_ = new Emitter();
        this.pool_ = pool;
        const rack = this.controller_.rack;
        rack.emitter.on('valuechange', this.onRackValueChange_);
    }
    get children() {
        return this.controller_.rack.children.map((bc) => this.pool_.createApi(bc));
    }
    addBinding(object, key, opt_params) {
        const params = opt_params !== null && opt_params !== void 0 ? opt_params : {};
        const doc = this.controller_.element.ownerDocument;
        const bc = this.pool_.createBinding(doc, createBindingTarget(object, key), params);
        const api = this.pool_.createBindingApi(bc);
        return this.add(api, params.index);
    }
    addFolder(params) {
        return addFolderAsBlade(this, params);
    }
    addButton(params) {
        return addButtonAsBlade(this, params);
    }
    addTab(params) {
        return addTabAsBlade(this, params);
    }
    add(api, opt_index) {
        const bc = api.controller;
        this.controller_.rack.add(bc, opt_index);
        return api;
    }
    remove(api) {
        this.controller_.rack.remove(api.controller);
    }
    addBlade(params) {
        const doc = this.controller_.element.ownerDocument;
        const bc = this.pool_.createBlade(doc, params);
        const api = this.pool_.createApi(bc);
        return this.add(api, params.index);
    }
    on(eventName, handler) {
        const bh = handler.bind(this);
        this.emitter_.on(eventName, (ev) => {
            bh(ev);
        }, {
            key: handler,
        });
        return this;
    }
    off(eventName, handler) {
        this.emitter_.off(eventName, handler);
        return this;
    }
    refresh() {
        this.children.forEach((c) => {
            if (isRefreshable(c)) {
                c.refresh();
            }
        });
    }
    onRackValueChange_(ev) {
        const bc = ev.bladeController;
        const api = this.pool_.createApi(bc);
        const binding = isBindingValue(bc.value) ? bc.value.binding : null;
        this.emitter_.emit('change', new TpChangeEvent(api, binding ? binding.target.read() : bc.value.rawValue, ev.options.last));
    }
}

class ContainerBladeApi extends BladeApi {
    constructor(controller, pool) {
        super(controller);
        this.rackApi_ = new RackApi(controller.rackController, pool);
    }
    refresh() {
        this.rackApi_.refresh();
    }
}

class ContainerBladeController extends BladeController {
    constructor(config) {
        super({
            blade: config.blade,
            view: config.view,
            viewProps: config.rackController.viewProps,
        });
        this.rackController = config.rackController;
    }
    importState(state) {
        return importBladeState(state, (s) => super.importState(s), (p) => ({
            children: p.required.array(p.required.raw),
        }), (result) => {
            return this.rackController.rack.children.every((c, index) => {
                return c.importState(result.children[index]);
            });
        });
    }
    exportState() {
        return exportBladeState(() => super.exportState(), {
            children: this.rackController.rack.children.map((c) => c.exportState()),
        });
    }
}
function isContainerBladeController(bc) {
    return 'rackController' in bc;
}

class NestedOrderedSet {
    constructor(extract) {
        this.emitter = new Emitter();
        this.items_ = [];
        this.cache_ = new Set();
        this.onSubListAdd_ = this.onSubListAdd_.bind(this);
        this.onSubListRemove_ = this.onSubListRemove_.bind(this);
        this.extract_ = extract;
    }
    get items() {
        return this.items_;
    }
    allItems() {
        return Array.from(this.cache_);
    }
    find(callback) {
        for (const item of this.allItems()) {
            if (callback(item)) {
                return item;
            }
        }
        return null;
    }
    includes(item) {
        return this.cache_.has(item);
    }
    add(item, opt_index) {
        if (this.includes(item)) {
            throw TpError.shouldNeverHappen();
        }
        const index = opt_index !== undefined ? opt_index : this.items_.length;
        this.items_.splice(index, 0, item);
        this.cache_.add(item);
        const subList = this.extract_(item);
        if (subList) {
            subList.emitter.on('add', this.onSubListAdd_);
            subList.emitter.on('remove', this.onSubListRemove_);
            subList.allItems().forEach((i) => {
                this.cache_.add(i);
            });
        }
        this.emitter.emit('add', {
            index: index,
            item: item,
            root: this,
            target: this,
        });
    }
    remove(item) {
        const index = this.items_.indexOf(item);
        if (index < 0) {
            return;
        }
        this.items_.splice(index, 1);
        this.cache_.delete(item);
        const subList = this.extract_(item);
        if (subList) {
            subList.allItems().forEach((i) => {
                this.cache_.delete(i);
            });
            subList.emitter.off('add', this.onSubListAdd_);
            subList.emitter.off('remove', this.onSubListRemove_);
        }
        this.emitter.emit('remove', {
            index: index,
            item: item,
            root: this,
            target: this,
        });
    }
    onSubListAdd_(ev) {
        this.cache_.add(ev.item);
        this.emitter.emit('add', {
            index: ev.index,
            item: ev.item,
            root: this,
            target: ev.target,
        });
    }
    onSubListRemove_(ev) {
        this.cache_.delete(ev.item);
        this.emitter.emit('remove', {
            index: ev.index,
            item: ev.item,
            root: this,
            target: ev.target,
        });
    }
}

function findValueBladeController(bcs, v) {
    for (let i = 0; i < bcs.length; i++) {
        const bc = bcs[i];
        if (isValueBladeController(bc) && bc.value === v) {
            return bc;
        }
    }
    return null;
}
function findSubBladeControllerSet(bc) {
    return isContainerBladeController(bc)
        ? bc.rackController.rack['bcSet_']
        : null;
}
class Rack {
    constructor(config) {
        var _a, _b;
        this.emitter = new Emitter();
        this.onBladePositionsChange_ = this.onBladePositionsChange_.bind(this);
        this.onSetAdd_ = this.onSetAdd_.bind(this);
        this.onSetRemove_ = this.onSetRemove_.bind(this);
        this.onChildDispose_ = this.onChildDispose_.bind(this);
        this.onChildPositionsChange_ = this.onChildPositionsChange_.bind(this);
        this.onChildValueChange_ = this.onChildValueChange_.bind(this);
        this.onChildViewPropsChange_ = this.onChildViewPropsChange_.bind(this);
        this.onRackLayout_ = this.onRackLayout_.bind(this);
        this.onRackValueChange_ = this.onRackValueChange_.bind(this);
        this.blade_ = (_a = config.blade) !== null && _a !== void 0 ? _a : null;
        (_b = this.blade_) === null || _b === void 0 ? void 0 : _b.value('positions').emitter.on('change', this.onBladePositionsChange_);
        this.viewProps = config.viewProps;
        this.bcSet_ = new NestedOrderedSet(findSubBladeControllerSet);
        this.bcSet_.emitter.on('add', this.onSetAdd_);
        this.bcSet_.emitter.on('remove', this.onSetRemove_);
    }
    get children() {
        return this.bcSet_.items;
    }
    add(bc, opt_index) {
        var _a;
        (_a = bc.parent) === null || _a === void 0 ? void 0 : _a.remove(bc);
        bc.parent = this;
        this.bcSet_.add(bc, opt_index);
    }
    remove(bc) {
        bc.parent = null;
        this.bcSet_.remove(bc);
    }
    find(finder) {
        return this.bcSet_.allItems().filter(finder);
    }
    onSetAdd_(ev) {
        this.updatePositions_();
        const root = ev.target === ev.root;
        this.emitter.emit('add', {
            bladeController: ev.item,
            index: ev.index,
            root: root,
            sender: this,
        });
        if (!root) {
            return;
        }
        const bc = ev.item;
        bc.viewProps.emitter.on('change', this.onChildViewPropsChange_);
        bc.blade
            .value('positions')
            .emitter.on('change', this.onChildPositionsChange_);
        bc.viewProps.handleDispose(this.onChildDispose_);
        if (isValueBladeController(bc)) {
            bc.value.emitter.on('change', this.onChildValueChange_);
        }
        else if (isContainerBladeController(bc)) {
            const rack = bc.rackController.rack;
            if (rack) {
                const emitter = rack.emitter;
                emitter.on('layout', this.onRackLayout_);
                emitter.on('valuechange', this.onRackValueChange_);
            }
        }
    }
    onSetRemove_(ev) {
        this.updatePositions_();
        const root = ev.target === ev.root;
        this.emitter.emit('remove', {
            bladeController: ev.item,
            root: root,
            sender: this,
        });
        if (!root) {
            return;
        }
        const bc = ev.item;
        if (isValueBladeController(bc)) {
            bc.value.emitter.off('change', this.onChildValueChange_);
        }
        else if (isContainerBladeController(bc)) {
            const rack = bc.rackController.rack;
            if (rack) {
                const emitter = rack.emitter;
                emitter.off('layout', this.onRackLayout_);
                emitter.off('valuechange', this.onRackValueChange_);
            }
        }
    }
    updatePositions_() {
        const visibleItems = this.bcSet_.items.filter((bc) => !bc.viewProps.get('hidden'));
        const firstVisibleItem = visibleItems[0];
        const lastVisibleItem = visibleItems[visibleItems.length - 1];
        this.bcSet_.items.forEach((bc) => {
            const ps = [];
            if (bc === firstVisibleItem) {
                ps.push('first');
                if (!this.blade_ ||
                    this.blade_.get('positions').includes('veryfirst')) {
                    ps.push('veryfirst');
                }
            }
            if (bc === lastVisibleItem) {
                ps.push('last');
                if (!this.blade_ || this.blade_.get('positions').includes('verylast')) {
                    ps.push('verylast');
                }
            }
            bc.blade.set('positions', ps);
        });
    }
    onChildPositionsChange_() {
        this.updatePositions_();
        this.emitter.emit('layout', {
            sender: this,
        });
    }
    onChildViewPropsChange_(_ev) {
        this.updatePositions_();
        this.emitter.emit('layout', {
            sender: this,
        });
    }
    onChildDispose_() {
        const disposedUcs = this.bcSet_.items.filter((bc) => {
            return bc.viewProps.get('disposed');
        });
        disposedUcs.forEach((bc) => {
            this.bcSet_.remove(bc);
        });
    }
    onChildValueChange_(ev) {
        const bc = findValueBladeController(this.find(isValueBladeController), ev.sender);
        if (!bc) {
            throw TpError.alreadyDisposed();
        }
        this.emitter.emit('valuechange', {
            bladeController: bc,
            options: ev.options,
            sender: this,
        });
    }
    onRackLayout_(_) {
        this.updatePositions_();
        this.emitter.emit('layout', {
            sender: this,
        });
    }
    onRackValueChange_(ev) {
        this.emitter.emit('valuechange', {
            bladeController: ev.bladeController,
            options: ev.options,
            sender: this,
        });
    }
    onBladePositionsChange_() {
        this.updatePositions_();
    }
}

class RackController {
    constructor(config) {
        this.onRackAdd_ = this.onRackAdd_.bind(this);
        this.onRackRemove_ = this.onRackRemove_.bind(this);
        this.element = config.element;
        this.viewProps = config.viewProps;
        const rack = new Rack({
            blade: config.root ? undefined : config.blade,
            viewProps: config.viewProps,
        });
        rack.emitter.on('add', this.onRackAdd_);
        rack.emitter.on('remove', this.onRackRemove_);
        this.rack = rack;
        this.viewProps.handleDispose(() => {
            for (let i = this.rack.children.length - 1; i >= 0; i--) {
                const bc = this.rack.children[i];
                bc.viewProps.set('disposed', true);
            }
        });
    }
    onRackAdd_(ev) {
        if (!ev.root) {
            return;
        }
        insertElementAt(this.element, ev.bladeController.view.element, ev.index);
    }
    onRackRemove_(ev) {
        if (!ev.root) {
            return;
        }
        removeElement(ev.bladeController.view.element);
    }
}

function createBlade() {
    return new ValueMap({
        positions: createValue([], {
            equals: deepEqualsArray,
        }),
    });
}

class Foldable extends ValueMap {
    constructor(valueMap) {
        super(valueMap);
    }
    static create(expanded) {
        const coreObj = {
            completed: true,
            expanded: expanded,
            expandedHeight: null,
            shouldFixHeight: false,
            temporaryExpanded: null,
        };
        const core = ValueMap.createCore(coreObj);
        return new Foldable(core);
    }
    get styleExpanded() {
        var _a;
        return (_a = this.get('temporaryExpanded')) !== null && _a !== void 0 ? _a : this.get('expanded');
    }
    get styleHeight() {
        if (!this.styleExpanded) {
            return '0';
        }
        const exHeight = this.get('expandedHeight');
        if (this.get('shouldFixHeight') && !isEmpty(exHeight)) {
            return `${exHeight}px`;
        }
        return 'auto';
    }
    bindExpandedClass(elem, expandedClassName) {
        const onExpand = () => {
            const expanded = this.styleExpanded;
            if (expanded) {
                elem.classList.add(expandedClassName);
            }
            else {
                elem.classList.remove(expandedClassName);
            }
        };
        bindValueMap(this, 'expanded', onExpand);
        bindValueMap(this, 'temporaryExpanded', onExpand);
    }
    cleanUpTransition() {
        this.set('shouldFixHeight', false);
        this.set('expandedHeight', null);
        this.set('completed', true);
    }
}
function computeExpandedFolderHeight(folder, containerElement) {
    let height = 0;
    disableTransitionTemporarily(containerElement, () => {
        folder.set('expandedHeight', null);
        folder.set('temporaryExpanded', true);
        forceReflow(containerElement);
        height = containerElement.clientHeight;
        folder.set('temporaryExpanded', null);
        forceReflow(containerElement);
    });
    return height;
}
function applyHeight(foldable, elem) {
    elem.style.height = foldable.styleHeight;
}
function bindFoldable(foldable, elem) {
    foldable.value('expanded').emitter.on('beforechange', () => {
        foldable.set('completed', false);
        if (isEmpty(foldable.get('expandedHeight'))) {
            const h = computeExpandedFolderHeight(foldable, elem);
            if (h > 0) {
                foldable.set('expandedHeight', h);
            }
        }
        foldable.set('shouldFixHeight', true);
        forceReflow(elem);
    });
    foldable.emitter.on('change', () => {
        applyHeight(foldable, elem);
    });
    applyHeight(foldable, elem);
    elem.addEventListener('transitionend', (ev) => {
        if (ev.propertyName !== 'height') {
            return;
        }
        foldable.cleanUpTransition();
    });
}

class FolderApi extends ContainerBladeApi {
    constructor(controller, pool) {
        super(controller, pool);
        this.emitter_ = new Emitter();
        this.controller.foldable
            .value('expanded')
            .emitter.on('change', (ev) => {
            this.emitter_.emit('fold', new TpFoldEvent(this, ev.sender.rawValue));
        });
        this.rackApi_.on('change', (ev) => {
            this.emitter_.emit('change', ev);
        });
    }
    get expanded() {
        return this.controller.foldable.get('expanded');
    }
    set expanded(expanded) {
        this.controller.foldable.set('expanded', expanded);
    }
    get title() {
        return this.controller.props.get('title');
    }
    set title(title) {
        this.controller.props.set('title', title);
    }
    get children() {
        return this.rackApi_.children;
    }
    addBinding(object, key, opt_params) {
        return this.rackApi_.addBinding(object, key, opt_params);
    }
    addFolder(params) {
        return this.rackApi_.addFolder(params);
    }
    addButton(params) {
        return this.rackApi_.addButton(params);
    }
    addTab(params) {
        return this.rackApi_.addTab(params);
    }
    add(api, opt_index) {
        return this.rackApi_.add(api, opt_index);
    }
    remove(api) {
        this.rackApi_.remove(api);
    }
    addBlade(params) {
        return this.rackApi_.addBlade(params);
    }
    on(eventName, handler) {
        const bh = handler.bind(this);
        this.emitter_.on(eventName, (ev) => {
            bh(ev);
        }, {
            key: handler,
        });
        return this;
    }
    off(eventName, handler) {
        this.emitter_.off(eventName, handler);
        return this;
    }
}

const bladeContainerClassName = ClassName('cnt');

class FolderView {
    constructor(doc, config) {
        var _a;
        this.className_ = ClassName((_a = config.viewName) !== null && _a !== void 0 ? _a : 'fld');
        this.element = doc.createElement('div');
        this.element.classList.add(this.className_(), bladeContainerClassName());
        config.viewProps.bindClassModifiers(this.element);
        this.foldable_ = config.foldable;
        this.foldable_.bindExpandedClass(this.element, this.className_(undefined, 'expanded'));
        bindValueMap(this.foldable_, 'completed', valueToClassName(this.element, this.className_(undefined, 'cpl')));
        const buttonElem = doc.createElement('button');
        buttonElem.classList.add(this.className_('b'));
        bindValueMap(config.props, 'title', (title) => {
            if (isEmpty(title)) {
                this.element.classList.add(this.className_(undefined, 'not'));
            }
            else {
                this.element.classList.remove(this.className_(undefined, 'not'));
            }
        });
        config.viewProps.bindDisabled(buttonElem);
        this.element.appendChild(buttonElem);
        this.buttonElement = buttonElem;
        const indentElem = doc.createElement('div');
        indentElem.classList.add(this.className_('i'));
        this.element.appendChild(indentElem);
        const titleElem = doc.createElement('div');
        titleElem.classList.add(this.className_('t'));
        bindValueToTextContent(config.props.value('title'), titleElem);
        this.buttonElement.appendChild(titleElem);
        this.titleElement = titleElem;
        const markElem = doc.createElement('div');
        markElem.classList.add(this.className_('m'));
        this.buttonElement.appendChild(markElem);
        const containerElem = doc.createElement('div');
        containerElem.classList.add(this.className_('c'));
        this.element.appendChild(containerElem);
        this.containerElement = containerElem;
    }
}

class FolderController extends ContainerBladeController {
    constructor(doc, config) {
        var _a;
        const foldable = Foldable.create((_a = config.expanded) !== null && _a !== void 0 ? _a : true);
        const view = new FolderView(doc, {
            foldable: foldable,
            props: config.props,
            viewName: config.root ? 'rot' : undefined,
            viewProps: config.viewProps,
        });
        super(Object.assign(Object.assign({}, config), { rackController: new RackController({
                blade: config.blade,
                element: view.containerElement,
                root: config.root,
                viewProps: config.viewProps,
            }), view: view }));
        this.onTitleClick_ = this.onTitleClick_.bind(this);
        this.props = config.props;
        this.foldable = foldable;
        bindFoldable(this.foldable, this.view.containerElement);
        this.rackController.rack.emitter.on('add', () => {
            this.foldable.cleanUpTransition();
        });
        this.rackController.rack.emitter.on('remove', () => {
            this.foldable.cleanUpTransition();
        });
        this.view.buttonElement.addEventListener('click', this.onTitleClick_);
    }
    get document() {
        return this.view.element.ownerDocument;
    }
    importState(state) {
        return importBladeState(state, (s) => super.importState(s), (p) => ({
            expanded: p.required.boolean,
            title: p.optional.string,
        }), (result) => {
            this.foldable.set('expanded', result.expanded);
            this.props.set('title', result.title);
            return true;
        });
    }
    exportState() {
        return exportBladeState(() => super.exportState(), {
            expanded: this.foldable.get('expanded'),
            title: this.props.get('title'),
        });
    }
    onTitleClick_() {
        this.foldable.set('expanded', !this.foldable.get('expanded'));
    }
}

createPlugin({
    id: 'folder',
    type: 'blade',
    accept(params) {
        const result = parseRecord(params, (p) => ({
            title: p.required.string,
            view: p.required.constant('folder'),
            expanded: p.optional.boolean,
        }));
        return result ? { params: result } : null;
    },
    controller(args) {
        return new FolderController(args.document, {
            blade: args.blade,
            expanded: args.params.expanded,
            props: ValueMap.fromObject({
                title: args.params.title,
            }),
            viewProps: args.viewProps,
        });
    },
    api(args) {
        if (!(args.controller instanceof FolderController)) {
            return null;
        }
        return new FolderApi(args.controller, args.pool);
    },
});

const cn$p = ClassName('');
function valueToModifier(elem, modifier) {
    return valueToClassName(elem, cn$p(undefined, modifier));
}
class ViewProps extends ValueMap {
    constructor(valueMap) {
        var _a;
        super(valueMap);
        this.onDisabledChange_ = this.onDisabledChange_.bind(this);
        this.onParentChange_ = this.onParentChange_.bind(this);
        this.onParentGlobalDisabledChange_ =
            this.onParentGlobalDisabledChange_.bind(this);
        [this.globalDisabled_, this.setGlobalDisabled_] = createReadonlyValue(createValue(this.getGlobalDisabled_()));
        this.value('disabled').emitter.on('change', this.onDisabledChange_);
        this.value('parent').emitter.on('change', this.onParentChange_);
        (_a = this.get('parent')) === null || _a === void 0 ? void 0 : _a.globalDisabled.emitter.on('change', this.onParentGlobalDisabledChange_);
    }
    static create(opt_initialValue) {
        var _a, _b, _c;
        const initialValue = opt_initialValue !== null && opt_initialValue !== void 0 ? opt_initialValue : {};
        return new ViewProps(ValueMap.createCore({
            disabled: (_a = initialValue.disabled) !== null && _a !== void 0 ? _a : false,
            disposed: false,
            hidden: (_b = initialValue.hidden) !== null && _b !== void 0 ? _b : false,
            parent: (_c = initialValue.parent) !== null && _c !== void 0 ? _c : null,
        }));
    }
    get globalDisabled() {
        return this.globalDisabled_;
    }
    bindClassModifiers(elem) {
        bindValue(this.globalDisabled_, valueToModifier(elem, 'disabled'));
        bindValueMap(this, 'hidden', valueToModifier(elem, 'hidden'));
    }
    bindDisabled(target) {
        bindValue(this.globalDisabled_, (disabled) => {
            target.disabled = disabled;
        });
    }
    bindTabIndex(elem) {
        bindValue(this.globalDisabled_, (disabled) => {
            elem.tabIndex = disabled ? -1 : 0;
        });
    }
    handleDispose(callback) {
        this.value('disposed').emitter.on('change', (disposed) => {
            if (disposed) {
                callback();
            }
        });
    }
    importState(state) {
        this.set('disabled', state.disabled);
        this.set('hidden', state.hidden);
    }
    exportState() {
        return {
            disabled: this.get('disabled'),
            hidden: this.get('hidden'),
        };
    }
    getGlobalDisabled_() {
        const parent = this.get('parent');
        const parentDisabled = parent ? parent.globalDisabled.rawValue : false;
        return parentDisabled || this.get('disabled');
    }
    updateGlobalDisabled_() {
        this.setGlobalDisabled_(this.getGlobalDisabled_());
    }
    onDisabledChange_() {
        this.updateGlobalDisabled_();
    }
    onParentGlobalDisabledChange_() {
        this.updateGlobalDisabled_();
    }
    onParentChange_(ev) {
        var _a;
        const prevParent = ev.previousRawValue;
        prevParent === null || prevParent === void 0 ? void 0 : prevParent.globalDisabled.emitter.off('change', this.onParentGlobalDisabledChange_);
        (_a = this.get('parent')) === null || _a === void 0 ? void 0 : _a.globalDisabled.emitter.on('change', this.onParentGlobalDisabledChange_);
        this.updateGlobalDisabled_();
    }
}

const cn$o = ClassName('tbp');
class TabPageView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$o());
        config.viewProps.bindClassModifiers(this.element);
        const containerElem = doc.createElement('div');
        containerElem.classList.add(cn$o('c'));
        this.element.appendChild(containerElem);
        this.containerElement = containerElem;
    }
}

const cn$n = ClassName('tbi');
class TabItemView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$n());
        config.viewProps.bindClassModifiers(this.element);
        bindValueMap(config.props, 'selected', (selected) => {
            if (selected) {
                this.element.classList.add(cn$n(undefined, 'sel'));
            }
            else {
                this.element.classList.remove(cn$n(undefined, 'sel'));
            }
        });
        const buttonElem = doc.createElement('button');
        buttonElem.classList.add(cn$n('b'));
        config.viewProps.bindDisabled(buttonElem);
        this.element.appendChild(buttonElem);
        this.buttonElement = buttonElem;
        const titleElem = doc.createElement('div');
        titleElem.classList.add(cn$n('t'));
        bindValueToTextContent(config.props.value('title'), titleElem);
        this.buttonElement.appendChild(titleElem);
        this.titleElement = titleElem;
    }
}

class TabItemController {
    constructor(doc, config) {
        this.emitter = new Emitter();
        this.onClick_ = this.onClick_.bind(this);
        this.props = config.props;
        this.viewProps = config.viewProps;
        this.view = new TabItemView(doc, {
            props: config.props,
            viewProps: config.viewProps,
        });
        this.view.buttonElement.addEventListener('click', this.onClick_);
    }
    onClick_() {
        this.emitter.emit('click', {
            sender: this,
        });
    }
}

class TabPageController extends ContainerBladeController {
    constructor(doc, config) {
        const view = new TabPageView(doc, {
            viewProps: config.viewProps,
        });
        super(Object.assign(Object.assign({}, config), { rackController: new RackController({
                blade: config.blade,
                element: view.containerElement,
                viewProps: config.viewProps,
            }), view: view }));
        this.onItemClick_ = this.onItemClick_.bind(this);
        this.ic_ = new TabItemController(doc, {
            props: config.itemProps,
            viewProps: ViewProps.create(),
        });
        this.ic_.emitter.on('click', this.onItemClick_);
        this.props = config.props;
        bindValueMap(this.props, 'selected', (selected) => {
            this.itemController.props.set('selected', selected);
            this.viewProps.set('hidden', !selected);
        });
    }
    get itemController() {
        return this.ic_;
    }
    importState(state) {
        return importBladeState(state, (s) => super.importState(s), (p) => ({
            selected: p.required.boolean,
            title: p.required.string,
        }), (result) => {
            this.ic_.props.set('selected', result.selected);
            this.ic_.props.set('title', result.title);
            return true;
        });
    }
    exportState() {
        return exportBladeState(() => super.exportState(), {
            selected: this.ic_.props.get('selected'),
            title: this.ic_.props.get('title'),
        });
    }
    onItemClick_() {
        this.props.set('selected', true);
    }
}

class TabApi extends ContainerBladeApi {
    constructor(controller, pool) {
        super(controller, pool);
        this.emitter_ = new Emitter();
        this.onSelect_ = this.onSelect_.bind(this);
        this.pool_ = pool;
        this.rackApi_.on('change', (ev) => {
            this.emitter_.emit('change', ev);
        });
        this.controller.tab.selectedIndex.emitter.on('change', this.onSelect_);
    }
    get pages() {
        return this.rackApi_.children;
    }
    addPage(params) {
        const doc = this.controller.view.element.ownerDocument;
        const pc = new TabPageController(doc, {
            blade: createBlade(),
            itemProps: ValueMap.fromObject({
                selected: false,
                title: params.title,
            }),
            props: ValueMap.fromObject({
                selected: false,
            }),
            viewProps: ViewProps.create(),
        });
        const papi = this.pool_.createApi(pc);
        return this.rackApi_.add(papi, params.index);
    }
    removePage(index) {
        this.rackApi_.remove(this.rackApi_.children[index]);
    }
    on(eventName, handler) {
        const bh = handler.bind(this);
        this.emitter_.on(eventName, (ev) => {
            bh(ev);
        }, {
            key: handler,
        });
        return this;
    }
    off(eventName, handler) {
        this.emitter_.off(eventName, handler);
        return this;
    }
    onSelect_(ev) {
        this.emitter_.emit('select', new TpTabSelectEvent(this, ev.rawValue));
    }
}

class TabPageApi extends ContainerBladeApi {
    get title() {
        var _a;
        return (_a = this.controller.itemController.props.get('title')) !== null && _a !== void 0 ? _a : '';
    }
    set title(title) {
        this.controller.itemController.props.set('title', title);
    }
    get selected() {
        return this.controller.props.get('selected');
    }
    set selected(selected) {
        this.controller.props.set('selected', selected);
    }
    get children() {
        return this.rackApi_.children;
    }
    addButton(params) {
        return this.rackApi_.addButton(params);
    }
    addFolder(params) {
        return this.rackApi_.addFolder(params);
    }
    addTab(params) {
        return this.rackApi_.addTab(params);
    }
    add(api, opt_index) {
        this.rackApi_.add(api, opt_index);
    }
    remove(api) {
        this.rackApi_.remove(api);
    }
    addBinding(object, key, opt_params) {
        return this.rackApi_.addBinding(object, key, opt_params);
    }
    addBlade(params) {
        return this.rackApi_.addBlade(params);
    }
}

const INDEX_NOT_SELECTED = -1;
class Tab {
    constructor() {
        this.onItemSelectedChange_ = this.onItemSelectedChange_.bind(this);
        this.empty = createValue(true);
        this.selectedIndex = createValue(INDEX_NOT_SELECTED);
        this.items_ = [];
    }
    add(item, opt_index) {
        const index = opt_index !== null && opt_index !== void 0 ? opt_index : this.items_.length;
        this.items_.splice(index, 0, item);
        item.emitter.on('change', this.onItemSelectedChange_);
        this.keepSelection_();
    }
    remove(item) {
        const index = this.items_.indexOf(item);
        if (index < 0) {
            return;
        }
        this.items_.splice(index, 1);
        item.emitter.off('change', this.onItemSelectedChange_);
        this.keepSelection_();
    }
    keepSelection_() {
        if (this.items_.length === 0) {
            this.selectedIndex.rawValue = INDEX_NOT_SELECTED;
            this.empty.rawValue = true;
            return;
        }
        const firstSelIndex = this.items_.findIndex((s) => s.rawValue);
        if (firstSelIndex < 0) {
            this.items_.forEach((s, i) => {
                s.rawValue = i === 0;
            });
            this.selectedIndex.rawValue = 0;
        }
        else {
            this.items_.forEach((s, i) => {
                s.rawValue = i === firstSelIndex;
            });
            this.selectedIndex.rawValue = firstSelIndex;
        }
        this.empty.rawValue = false;
    }
    onItemSelectedChange_(ev) {
        if (ev.rawValue) {
            const index = this.items_.findIndex((s) => s === ev.sender);
            this.items_.forEach((s, i) => {
                s.rawValue = i === index;
            });
            this.selectedIndex.rawValue = index;
        }
        else {
            this.keepSelection_();
        }
    }
}

const cn$m = ClassName('tab');
class TabView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$m(), bladeContainerClassName());
        config.viewProps.bindClassModifiers(this.element);
        bindValue(config.empty, valueToClassName(this.element, cn$m(undefined, 'nop')));
        const titleElem = doc.createElement('div');
        titleElem.classList.add(cn$m('t'));
        this.element.appendChild(titleElem);
        this.itemsElement = titleElem;
        const indentElem = doc.createElement('div');
        indentElem.classList.add(cn$m('i'));
        this.element.appendChild(indentElem);
        const contentsElem = doc.createElement('div');
        contentsElem.classList.add(cn$m('c'));
        this.element.appendChild(contentsElem);
        this.contentsElement = contentsElem;
    }
}

class TabController extends ContainerBladeController {
    constructor(doc, config) {
        const tab = new Tab();
        const view = new TabView(doc, {
            empty: tab.empty,
            viewProps: config.viewProps,
        });
        super({
            blade: config.blade,
            rackController: new RackController({
                blade: config.blade,
                element: view.contentsElement,
                viewProps: config.viewProps,
            }),
            view: view,
        });
        this.onRackAdd_ = this.onRackAdd_.bind(this);
        this.onRackRemove_ = this.onRackRemove_.bind(this);
        const rack = this.rackController.rack;
        rack.emitter.on('add', this.onRackAdd_);
        rack.emitter.on('remove', this.onRackRemove_);
        this.tab = tab;
    }
    add(pc, opt_index) {
        this.rackController.rack.add(pc, opt_index);
    }
    remove(index) {
        this.rackController.rack.remove(this.rackController.rack.children[index]);
    }
    onRackAdd_(ev) {
        if (!ev.root) {
            return;
        }
        const pc = ev.bladeController;
        insertElementAt(this.view.itemsElement, pc.itemController.view.element, ev.index);
        pc.itemController.viewProps.set('parent', this.viewProps);
        this.tab.add(pc.props.value('selected'));
    }
    onRackRemove_(ev) {
        if (!ev.root) {
            return;
        }
        const pc = ev.bladeController;
        removeElement(pc.itemController.view.element);
        pc.itemController.viewProps.set('parent', null);
        this.tab.remove(pc.props.value('selected'));
    }
}

createPlugin({
    id: 'tab',
    type: 'blade',
    accept(params) {
        const result = parseRecord(params, (p) => ({
            pages: p.required.array(p.required.object({ title: p.required.string })),
            view: p.required.constant('tab'),
        }));
        if (!result || result.pages.length === 0) {
            return null;
        }
        return { params: result };
    },
    controller(args) {
        const c = new TabController(args.document, {
            blade: args.blade,
            viewProps: args.viewProps,
        });
        args.params.pages.forEach((p) => {
            const pc = new TabPageController(args.document, {
                blade: createBlade(),
                itemProps: ValueMap.fromObject({
                    selected: false,
                    title: p.title,
                }),
                props: ValueMap.fromObject({
                    selected: false,
                }),
                viewProps: ViewProps.create(),
            });
            c.add(pc);
        });
        return c;
    },
    api(args) {
        if (args.controller instanceof TabController) {
            return new TabApi(args.controller, args.pool);
        }
        if (args.controller instanceof TabPageController) {
            return new TabPageApi(args.controller, args.pool);
        }
        return null;
    },
});

class ListInputBindingApi extends BindingApi {
    get options() {
        return this.controller.valueController.props.get('options');
    }
    set options(options) {
        this.controller.valueController.props.set('options', options);
    }
}

class CompositeConstraint {
    constructor(constraints) {
        this.constraints = constraints;
    }
    constrain(value) {
        return this.constraints.reduce((result, c) => {
            return c.constrain(result);
        }, value);
    }
}
function findConstraint(c, constraintClass) {
    if (c instanceof constraintClass) {
        return c;
    }
    if (c instanceof CompositeConstraint) {
        const result = c.constraints.reduce((tmpResult, sc) => {
            if (tmpResult) {
                return tmpResult;
            }
            return sc instanceof constraintClass ? sc : null;
        }, null);
        if (result) {
            return result;
        }
    }
    return null;
}

class ListConstraint {
    constructor(options) {
        this.values = ValueMap.fromObject({
            options: options,
        });
    }
    constrain(value) {
        const opts = this.values.get('options');
        if (opts.length === 0) {
            return value;
        }
        const matched = opts.filter((item) => {
            return item.value === value;
        }).length > 0;
        return matched ? value : opts[0].value;
    }
}

function parseListOptions(value) {
    var _a;
    const p = MicroParsers;
    if (Array.isArray(value)) {
        return (_a = parseRecord({ items: value }, (p) => ({
            items: p.required.array(p.required.object({
                text: p.required.string,
                value: p.required.raw,
            })),
        }))) === null || _a === void 0 ? void 0 : _a.items;
    }
    if (typeof value === 'object') {
        return p.required.raw(value)
            .value;
    }
    return undefined;
}
function normalizeListOptions(options) {
    if (Array.isArray(options)) {
        return options;
    }
    const items = [];
    Object.keys(options).forEach((text) => {
        items.push({ text: text, value: options[text] });
    });
    return items;
}
function createListConstraint(options) {
    return !isEmpty(options)
        ? new ListConstraint(normalizeListOptions(forceCast(options)))
        : null;
}

const cn$l = ClassName('lst');
class ListView {
    constructor(doc, config) {
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.props_ = config.props;
        this.element = doc.createElement('div');
        this.element.classList.add(cn$l());
        config.viewProps.bindClassModifiers(this.element);
        const selectElem = doc.createElement('select');
        selectElem.classList.add(cn$l('s'));
        config.viewProps.bindDisabled(selectElem);
        this.element.appendChild(selectElem);
        this.selectElement = selectElem;
        const markElem = doc.createElement('div');
        markElem.classList.add(cn$l('m'));
        markElem.appendChild(createSvgIconElement(doc, 'dropdown'));
        this.element.appendChild(markElem);
        config.value.emitter.on('change', this.onValueChange_);
        this.value_ = config.value;
        bindValueMap(this.props_, 'options', (opts) => {
            removeChildElements(this.selectElement);
            opts.forEach((item) => {
                const optionElem = doc.createElement('option');
                optionElem.textContent = item.text;
                this.selectElement.appendChild(optionElem);
            });
            this.update_();
        });
    }
    update_() {
        const values = this.props_.get('options').map((o) => o.value);
        this.selectElement.selectedIndex = values.indexOf(this.value_.rawValue);
    }
    onValueChange_() {
        this.update_();
    }
}

class ListController {
    constructor(doc, config) {
        this.onSelectChange_ = this.onSelectChange_.bind(this);
        this.props = config.props;
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new ListView(doc, {
            props: this.props,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view.selectElement.addEventListener('change', this.onSelectChange_);
    }
    onSelectChange_(e) {
        const selectElem = forceCast(e.currentTarget);
        this.value.rawValue =
            this.props.get('options')[selectElem.selectedIndex].value;
    }
    importProps(state) {
        return importBladeState(state, null, (p) => ({
            options: p.required.custom(parseListOptions),
        }), (result) => {
            this.props.set('options', normalizeListOptions(result.options));
            return true;
        });
    }
    exportProps() {
        return exportBladeState(null, {
            options: this.props.get('options'),
        });
    }
}

const cn$k = ClassName('pop');
class PopupView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$k());
        config.viewProps.bindClassModifiers(this.element);
        bindValue(config.shows, valueToClassName(this.element, cn$k(undefined, 'v')));
    }
}

class PopupController {
    constructor(doc, config) {
        this.shows = createValue(false);
        this.viewProps = config.viewProps;
        this.view = new PopupView(doc, {
            shows: this.shows,
            viewProps: this.viewProps,
        });
    }
}

const cn$j = ClassName('txt');
class TextView {
    constructor(doc, config) {
        this.onChange_ = this.onChange_.bind(this);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$j());
        config.viewProps.bindClassModifiers(this.element);
        this.props_ = config.props;
        this.props_.emitter.on('change', this.onChange_);
        const inputElem = doc.createElement('input');
        inputElem.classList.add(cn$j('i'));
        inputElem.type = 'text';
        config.viewProps.bindDisabled(inputElem);
        this.element.appendChild(inputElem);
        this.inputElement = inputElem;
        config.value.emitter.on('change', this.onChange_);
        this.value_ = config.value;
        this.refresh();
    }
    refresh() {
        const formatter = this.props_.get('formatter');
        this.inputElement.value = formatter(this.value_.rawValue);
    }
    onChange_() {
        this.refresh();
    }
}

class TextController {
    constructor(doc, config) {
        this.onInputChange_ = this.onInputChange_.bind(this);
        this.parser_ = config.parser;
        this.props = config.props;
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new TextView(doc, {
            props: config.props,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view.inputElement.addEventListener('change', this.onInputChange_);
    }
    onInputChange_(e) {
        const inputElem = forceCast(e.currentTarget);
        const value = inputElem.value;
        const parsedValue = this.parser_(value);
        if (!isEmpty(parsedValue)) {
            this.value.rawValue = parsedValue;
        }
        this.view.refresh();
    }
}

function boolToString(value) {
    return String(value);
}
function boolFromUnknown(value) {
    if (value === 'false') {
        return false;
    }
    return !!value;
}
function BooleanFormatter(value) {
    return boolToString(value);
}

function composeParsers(parsers) {
    return (text) => {
        return parsers.reduce((result, parser) => {
            if (result !== null) {
                return result;
            }
            return parser(text);
        }, null);
    };
}

const innerFormatter = createNumberFormatter(0);
function formatPercentage(value) {
    return innerFormatter(value) + '%';
}

function stringFromUnknown(value) {
    return String(value);
}
function formatString(value) {
    return value;
}

function connectValues({ primary, secondary, forward, backward, }) {
    let changing = false;
    function preventFeedback(callback) {
        if (changing) {
            return;
        }
        changing = true;
        callback();
        changing = false;
    }
    primary.emitter.on('change', (ev) => {
        preventFeedback(() => {
            secondary.setRawValue(forward(primary.rawValue, secondary.rawValue), ev.options);
        });
    });
    secondary.emitter.on('change', (ev) => {
        preventFeedback(() => {
            primary.setRawValue(backward(primary.rawValue, secondary.rawValue), ev.options);
        });
        preventFeedback(() => {
            secondary.setRawValue(forward(primary.rawValue, secondary.rawValue), ev.options);
        });
    });
    preventFeedback(() => {
        secondary.setRawValue(forward(primary.rawValue, secondary.rawValue), {
            forceEmit: false,
            last: true,
        });
    });
}

function getStepForKey(keyScale, keys) {
    const step = keyScale * (keys.altKey ? 0.1 : 1) * (keys.shiftKey ? 10 : 1);
    if (keys.upKey) {
        return +step;
    }
    else if (keys.downKey) {
        return -step;
    }
    return 0;
}
function getVerticalStepKeys(ev) {
    return {
        altKey: ev.altKey,
        downKey: ev.key === 'ArrowDown',
        shiftKey: ev.shiftKey,
        upKey: ev.key === 'ArrowUp',
    };
}
function getHorizontalStepKeys(ev) {
    return {
        altKey: ev.altKey,
        downKey: ev.key === 'ArrowLeft',
        shiftKey: ev.shiftKey,
        upKey: ev.key === 'ArrowRight',
    };
}
function isVerticalArrowKey(key) {
    return key === 'ArrowUp' || key === 'ArrowDown';
}
function isArrowKey(key) {
    return isVerticalArrowKey(key) || key === 'ArrowLeft' || key === 'ArrowRight';
}

function computeOffset$1(ev, elem) {
    var _a, _b;
    const win = elem.ownerDocument.defaultView;
    const rect = elem.getBoundingClientRect();
    return {
        x: ev.pageX - (((_a = (win && win.scrollX)) !== null && _a !== void 0 ? _a : 0) + rect.left),
        y: ev.pageY - (((_b = (win && win.scrollY)) !== null && _b !== void 0 ? _b : 0) + rect.top),
    };
}
class PointerHandler {
    constructor(element) {
        this.lastTouch_ = null;
        this.onDocumentMouseMove_ = this.onDocumentMouseMove_.bind(this);
        this.onDocumentMouseUp_ = this.onDocumentMouseUp_.bind(this);
        this.onMouseDown_ = this.onMouseDown_.bind(this);
        this.onTouchEnd_ = this.onTouchEnd_.bind(this);
        this.onTouchMove_ = this.onTouchMove_.bind(this);
        this.onTouchStart_ = this.onTouchStart_.bind(this);
        this.elem_ = element;
        this.emitter = new Emitter();
        element.addEventListener('touchstart', this.onTouchStart_, {
            passive: false,
        });
        element.addEventListener('touchmove', this.onTouchMove_, {
            passive: true,
        });
        element.addEventListener('touchend', this.onTouchEnd_);
        element.addEventListener('mousedown', this.onMouseDown_);
    }
    computePosition_(offset) {
        const rect = this.elem_.getBoundingClientRect();
        return {
            bounds: {
                width: rect.width,
                height: rect.height,
            },
            point: offset
                ? {
                    x: offset.x,
                    y: offset.y,
                }
                : null,
        };
    }
    onMouseDown_(ev) {
        var _a;
        ev.preventDefault();
        (_a = ev.currentTarget) === null || _a === void 0 ? void 0 : _a.focus();
        const doc = this.elem_.ownerDocument;
        doc.addEventListener('mousemove', this.onDocumentMouseMove_);
        doc.addEventListener('mouseup', this.onDocumentMouseUp_);
        this.emitter.emit('down', {
            altKey: ev.altKey,
            data: this.computePosition_(computeOffset$1(ev, this.elem_)),
            sender: this,
            shiftKey: ev.shiftKey,
        });
    }
    onDocumentMouseMove_(ev) {
        this.emitter.emit('move', {
            altKey: ev.altKey,
            data: this.computePosition_(computeOffset$1(ev, this.elem_)),
            sender: this,
            shiftKey: ev.shiftKey,
        });
    }
    onDocumentMouseUp_(ev) {
        const doc = this.elem_.ownerDocument;
        doc.removeEventListener('mousemove', this.onDocumentMouseMove_);
        doc.removeEventListener('mouseup', this.onDocumentMouseUp_);
        this.emitter.emit('up', {
            altKey: ev.altKey,
            data: this.computePosition_(computeOffset$1(ev, this.elem_)),
            sender: this,
            shiftKey: ev.shiftKey,
        });
    }
    onTouchStart_(ev) {
        ev.preventDefault();
        const touch = ev.targetTouches.item(0);
        const rect = this.elem_.getBoundingClientRect();
        this.emitter.emit('down', {
            altKey: ev.altKey,
            data: this.computePosition_(touch
                ? {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top,
                }
                : undefined),
            sender: this,
            shiftKey: ev.shiftKey,
        });
        this.lastTouch_ = touch;
    }
    onTouchMove_(ev) {
        const touch = ev.targetTouches.item(0);
        const rect = this.elem_.getBoundingClientRect();
        this.emitter.emit('move', {
            altKey: ev.altKey,
            data: this.computePosition_(touch
                ? {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top,
                }
                : undefined),
            sender: this,
            shiftKey: ev.shiftKey,
        });
        this.lastTouch_ = touch;
    }
    onTouchEnd_(ev) {
        var _a;
        const touch = (_a = ev.targetTouches.item(0)) !== null && _a !== void 0 ? _a : this.lastTouch_;
        const rect = this.elem_.getBoundingClientRect();
        this.emitter.emit('up', {
            altKey: ev.altKey,
            data: this.computePosition_(touch
                ? {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top,
                }
                : undefined),
            sender: this,
            shiftKey: ev.shiftKey,
        });
    }
}

const cn$i = ClassName('txt');
class NumberTextView {
    constructor(doc, config) {
        this.onChange_ = this.onChange_.bind(this);
        this.props_ = config.props;
        this.props_.emitter.on('change', this.onChange_);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$i(), cn$i(undefined, 'num'));
        if (config.arrayPosition) {
            this.element.classList.add(cn$i(undefined, config.arrayPosition));
        }
        config.viewProps.bindClassModifiers(this.element);
        const inputElem = doc.createElement('input');
        inputElem.classList.add(cn$i('i'));
        inputElem.type = 'text';
        config.viewProps.bindDisabled(inputElem);
        this.element.appendChild(inputElem);
        this.inputElement = inputElem;
        this.onDraggingChange_ = this.onDraggingChange_.bind(this);
        this.dragging_ = config.dragging;
        this.dragging_.emitter.on('change', this.onDraggingChange_);
        this.element.classList.add(cn$i());
        this.inputElement.classList.add(cn$i('i'));
        const knobElem = doc.createElement('div');
        knobElem.classList.add(cn$i('k'));
        this.element.appendChild(knobElem);
        this.knobElement = knobElem;
        const guideElem = doc.createElementNS(SVG_NS, 'svg');
        guideElem.classList.add(cn$i('g'));
        this.knobElement.appendChild(guideElem);
        const bodyElem = doc.createElementNS(SVG_NS, 'path');
        bodyElem.classList.add(cn$i('gb'));
        guideElem.appendChild(bodyElem);
        this.guideBodyElem_ = bodyElem;
        const headElem = doc.createElementNS(SVG_NS, 'path');
        headElem.classList.add(cn$i('gh'));
        guideElem.appendChild(headElem);
        this.guideHeadElem_ = headElem;
        const tooltipElem = doc.createElement('div');
        tooltipElem.classList.add(ClassName('tt')());
        this.knobElement.appendChild(tooltipElem);
        this.tooltipElem_ = tooltipElem;
        config.value.emitter.on('change', this.onChange_);
        this.value = config.value;
        this.refresh();
    }
    onDraggingChange_(ev) {
        if (ev.rawValue === null) {
            this.element.classList.remove(cn$i(undefined, 'drg'));
            return;
        }
        this.element.classList.add(cn$i(undefined, 'drg'));
        const x = ev.rawValue / this.props_.get('pointerScale');
        const aox = x + (x > 0 ? -1 : x < 0 ? +1 : 0);
        const adx = constrainRange(-aox, -4, +4);
        this.guideHeadElem_.setAttributeNS(null, 'd', [`M ${aox + adx},0 L${aox},4 L${aox + adx},8`, `M ${x},-1 L${x},9`].join(' '));
        this.guideBodyElem_.setAttributeNS(null, 'd', `M 0,4 L${x},4`);
        const formatter = this.props_.get('formatter');
        this.tooltipElem_.textContent = formatter(this.value.rawValue);
        this.tooltipElem_.style.left = `${x}px`;
    }
    refresh() {
        const formatter = this.props_.get('formatter');
        this.inputElement.value = formatter(this.value.rawValue);
    }
    onChange_() {
        this.refresh();
    }
}

class NumberTextController {
    constructor(doc, config) {
        var _a;
        this.originRawValue_ = 0;
        this.onInputChange_ = this.onInputChange_.bind(this);
        this.onInputKeyDown_ = this.onInputKeyDown_.bind(this);
        this.onInputKeyUp_ = this.onInputKeyUp_.bind(this);
        this.onPointerDown_ = this.onPointerDown_.bind(this);
        this.onPointerMove_ = this.onPointerMove_.bind(this);
        this.onPointerUp_ = this.onPointerUp_.bind(this);
        this.parser_ = config.parser;
        this.props = config.props;
        this.sliderProps_ = (_a = config.sliderProps) !== null && _a !== void 0 ? _a : null;
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.dragging_ = createValue(null);
        this.view = new NumberTextView(doc, {
            arrayPosition: config.arrayPosition,
            dragging: this.dragging_,
            props: this.props,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view.inputElement.addEventListener('change', this.onInputChange_);
        this.view.inputElement.addEventListener('keydown', this.onInputKeyDown_);
        this.view.inputElement.addEventListener('keyup', this.onInputKeyUp_);
        const ph = new PointerHandler(this.view.knobElement);
        ph.emitter.on('down', this.onPointerDown_);
        ph.emitter.on('move', this.onPointerMove_);
        ph.emitter.on('up', this.onPointerUp_);
    }
    constrainValue_(value) {
        var _a, _b;
        const min = (_a = this.sliderProps_) === null || _a === void 0 ? void 0 : _a.get('min');
        const max = (_b = this.sliderProps_) === null || _b === void 0 ? void 0 : _b.get('max');
        let v = value;
        if (min !== undefined) {
            v = Math.max(v, min);
        }
        if (max !== undefined) {
            v = Math.min(v, max);
        }
        return v;
    }
    onInputChange_(e) {
        const inputElem = forceCast(e.currentTarget);
        const value = inputElem.value;
        const parsedValue = this.parser_(value);
        if (!isEmpty(parsedValue)) {
            this.value.rawValue = this.constrainValue_(parsedValue);
        }
        this.view.refresh();
    }
    onInputKeyDown_(ev) {
        const step = getStepForKey(this.props.get('keyScale'), getVerticalStepKeys(ev));
        if (step === 0) {
            return;
        }
        this.value.setRawValue(this.constrainValue_(this.value.rawValue + step), {
            forceEmit: false,
            last: false,
        });
    }
    onInputKeyUp_(ev) {
        const step = getStepForKey(this.props.get('keyScale'), getVerticalStepKeys(ev));
        if (step === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue, {
            forceEmit: true,
            last: true,
        });
    }
    onPointerDown_() {
        this.originRawValue_ = this.value.rawValue;
        this.dragging_.rawValue = 0;
    }
    computeDraggingValue_(data) {
        if (!data.point) {
            return null;
        }
        const dx = data.point.x - data.bounds.width / 2;
        return this.constrainValue_(this.originRawValue_ + dx * this.props.get('pointerScale'));
    }
    onPointerMove_(ev) {
        const v = this.computeDraggingValue_(ev.data);
        if (v === null) {
            return;
        }
        this.value.setRawValue(v, {
            forceEmit: false,
            last: false,
        });
        this.dragging_.rawValue = this.value.rawValue - this.originRawValue_;
    }
    onPointerUp_(ev) {
        const v = this.computeDraggingValue_(ev.data);
        if (v === null) {
            return;
        }
        this.value.setRawValue(v, {
            forceEmit: true,
            last: true,
        });
        this.dragging_.rawValue = null;
    }
}

const cn$h = ClassName('sld');
class SliderView {
    constructor(doc, config) {
        this.onChange_ = this.onChange_.bind(this);
        this.props_ = config.props;
        this.props_.emitter.on('change', this.onChange_);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$h());
        config.viewProps.bindClassModifiers(this.element);
        const trackElem = doc.createElement('div');
        trackElem.classList.add(cn$h('t'));
        config.viewProps.bindTabIndex(trackElem);
        this.element.appendChild(trackElem);
        this.trackElement = trackElem;
        const knobElem = doc.createElement('div');
        knobElem.classList.add(cn$h('k'));
        this.trackElement.appendChild(knobElem);
        this.knobElement = knobElem;
        config.value.emitter.on('change', this.onChange_);
        this.value = config.value;
        this.update_();
    }
    update_() {
        const p = constrainRange(mapRange$1(this.value.rawValue, this.props_.get('min'), this.props_.get('max'), 0, 100), 0, 100);
        this.knobElement.style.width = `${p}%`;
    }
    onChange_() {
        this.update_();
    }
}

class SliderController {
    constructor(doc, config) {
        this.onKeyDown_ = this.onKeyDown_.bind(this);
        this.onKeyUp_ = this.onKeyUp_.bind(this);
        this.onPointerDownOrMove_ = this.onPointerDownOrMove_.bind(this);
        this.onPointerUp_ = this.onPointerUp_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.props = config.props;
        this.view = new SliderView(doc, {
            props: this.props,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.ptHandler_ = new PointerHandler(this.view.trackElement);
        this.ptHandler_.emitter.on('down', this.onPointerDownOrMove_);
        this.ptHandler_.emitter.on('move', this.onPointerDownOrMove_);
        this.ptHandler_.emitter.on('up', this.onPointerUp_);
        this.view.trackElement.addEventListener('keydown', this.onKeyDown_);
        this.view.trackElement.addEventListener('keyup', this.onKeyUp_);
    }
    handlePointerEvent_(d, opts) {
        if (!d.point) {
            return;
        }
        this.value.setRawValue(mapRange$1(constrainRange(d.point.x, 0, d.bounds.width), 0, d.bounds.width, this.props.get('min'), this.props.get('max')), opts);
    }
    onPointerDownOrMove_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerUp_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: true,
            last: true,
        });
    }
    onKeyDown_(ev) {
        const step = getStepForKey(this.props.get('keyScale'), getHorizontalStepKeys(ev));
        if (step === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue + step, {
            forceEmit: false,
            last: false,
        });
    }
    onKeyUp_(ev) {
        const step = getStepForKey(this.props.get('keyScale'), getHorizontalStepKeys(ev));
        if (step === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue, {
            forceEmit: true,
            last: true,
        });
    }
}

const cn$g = ClassName('sldtxt');
class SliderTextView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$g());
        const sliderElem = doc.createElement('div');
        sliderElem.classList.add(cn$g('s'));
        this.sliderView_ = config.sliderView;
        sliderElem.appendChild(this.sliderView_.element);
        this.element.appendChild(sliderElem);
        const textElem = doc.createElement('div');
        textElem.classList.add(cn$g('t'));
        this.textView_ = config.textView;
        textElem.appendChild(this.textView_.element);
        this.element.appendChild(textElem);
    }
}

class SliderTextController {
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.sliderC_ = new SliderController(doc, {
            props: config.sliderProps,
            value: config.value,
            viewProps: this.viewProps,
        });
        this.textC_ = new NumberTextController(doc, {
            parser: config.parser,
            props: config.textProps,
            sliderProps: config.sliderProps,
            value: config.value,
            viewProps: config.viewProps,
        });
        this.view = new SliderTextView(doc, {
            sliderView: this.sliderC_.view,
            textView: this.textC_.view,
        });
    }
    get sliderController() {
        return this.sliderC_;
    }
    get textController() {
        return this.textC_;
    }
    importProps(state) {
        return importBladeState(state, null, (p) => ({
            max: p.required.number,
            min: p.required.number,
        }), (result) => {
            const sliderProps = this.sliderC_.props;
            sliderProps.set('max', result.max);
            sliderProps.set('min', result.min);
            return true;
        });
    }
    exportProps() {
        const sliderProps = this.sliderC_.props;
        return exportBladeState(null, {
            max: sliderProps.get('max'),
            min: sliderProps.get('min'),
        });
    }
}
function createSliderTextProps(config) {
    return {
        sliderProps: new ValueMap({
            keyScale: config.keyScale,
            max: config.max,
            min: config.min,
        }),
        textProps: new ValueMap({
            formatter: createValue(config.formatter),
            keyScale: config.keyScale,
            pointerScale: createValue(config.pointerScale),
        }),
    };
}

const CSS_VAR_MAP = {
    containerUnitSize: 'cnt-usz',
};
function getCssVar(key) {
    return `--${CSS_VAR_MAP[key]}`;
}

function createPointDimensionParser(p) {
    return createNumberTextInputParamsParser(p);
}
function parsePointDimensionParams(value) {
    if (!isRecord(value)) {
        return undefined;
    }
    return parseRecord(value, createPointDimensionParser);
}
function createDimensionConstraint(params, initialValue) {
    if (!params) {
        return undefined;
    }
    const constraints = [];
    const cs = createStepConstraint(params, initialValue);
    if (cs) {
        constraints.push(cs);
    }
    const rs = createRangeConstraint(params);
    if (rs) {
        constraints.push(rs);
    }
    return new CompositeConstraint(constraints);
}

function parsePickerLayout(value) {
    if (value === 'inline' || value === 'popup') {
        return value;
    }
    return undefined;
}

function writePrimitive(target, value) {
    target.write(value);
}

const cn$f = ClassName('ckb');
class CheckboxView {
    constructor(doc, config) {
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$f());
        config.viewProps.bindClassModifiers(this.element);
        const labelElem = doc.createElement('label');
        labelElem.classList.add(cn$f('l'));
        this.element.appendChild(labelElem);
        this.labelElement = labelElem;
        const inputElem = doc.createElement('input');
        inputElem.classList.add(cn$f('i'));
        inputElem.type = 'checkbox';
        this.labelElement.appendChild(inputElem);
        this.inputElement = inputElem;
        config.viewProps.bindDisabled(this.inputElement);
        const wrapperElem = doc.createElement('div');
        wrapperElem.classList.add(cn$f('w'));
        this.labelElement.appendChild(wrapperElem);
        const markElem = createSvgIconElement(doc, 'check');
        wrapperElem.appendChild(markElem);
        config.value.emitter.on('change', this.onValueChange_);
        this.value = config.value;
        this.update_();
    }
    update_() {
        this.inputElement.checked = this.value.rawValue;
    }
    onValueChange_() {
        this.update_();
    }
}

class CheckboxController {
    constructor(doc, config) {
        this.onInputChange_ = this.onInputChange_.bind(this);
        this.onLabelMouseDown_ = this.onLabelMouseDown_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new CheckboxView(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view.inputElement.addEventListener('change', this.onInputChange_);
        this.view.labelElement.addEventListener('mousedown', this.onLabelMouseDown_);
    }
    onInputChange_(ev) {
        const inputElem = forceCast(ev.currentTarget);
        this.value.rawValue = inputElem.checked;
        ev.preventDefault();
        ev.stopPropagation();
    }
    onLabelMouseDown_(ev) {
        ev.preventDefault();
    }
}

function createConstraint$6(params) {
    const constraints = [];
    const lc = createListConstraint(params.options);
    if (lc) {
        constraints.push(lc);
    }
    return new CompositeConstraint(constraints);
}
createPlugin({
    id: 'input-bool',
    type: 'input',
    accept: (value, params) => {
        if (typeof value !== 'boolean') {
            return null;
        }
        const result = parseRecord(params, (p) => ({
            options: p.optional.custom(parseListOptions),
            readonly: p.optional.constant(false),
        }));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => boolFromUnknown,
        constraint: (args) => createConstraint$6(args.params),
        writer: (_args) => writePrimitive,
    },
    controller: (args) => {
        const doc = args.document;
        const value = args.value;
        const c = args.constraint;
        const lc = c && findConstraint(c, ListConstraint);
        if (lc) {
            return new ListController(doc, {
                props: new ValueMap({
                    options: lc.values.value('options'),
                }),
                value: value,
                viewProps: args.viewProps,
            });
        }
        return new CheckboxController(doc, {
            value: value,
            viewProps: args.viewProps,
        });
    },
    api(args) {
        if (typeof args.controller.value.rawValue !== 'boolean') {
            return null;
        }
        if (args.controller.valueController instanceof ListController) {
            return new ListInputBindingApi(args.controller);
        }
        return null;
    },
});

const cn$e = ClassName('col');
class ColorView$1 {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$e());
        config.foldable.bindExpandedClass(this.element, cn$e(undefined, 'expanded'));
        bindValueMap(config.foldable, 'completed', valueToClassName(this.element, cn$e(undefined, 'cpl')));
        const headElem = doc.createElement('div');
        headElem.classList.add(cn$e('h'));
        this.element.appendChild(headElem);
        const swatchElem = doc.createElement('div');
        swatchElem.classList.add(cn$e('s'));
        headElem.appendChild(swatchElem);
        this.swatchElement = swatchElem;
        const textElem = doc.createElement('div');
        textElem.classList.add(cn$e('t'));
        headElem.appendChild(textElem);
        this.textElement = textElem;
        if (config.pickerLayout === 'inline') {
            const pickerElem = doc.createElement('div');
            pickerElem.classList.add(cn$e('p'));
            this.element.appendChild(pickerElem);
            this.pickerElement = pickerElem;
        }
        else {
            this.pickerElement = null;
        }
    }
}

function rgbToHslInt(r, g, b) {
    const rp = constrainRange(r / 255, 0, 1);
    const gp = constrainRange(g / 255, 0, 1);
    const bp = constrainRange(b / 255, 0, 1);
    const cmax = Math.max(rp, gp, bp);
    const cmin = Math.min(rp, gp, bp);
    const c = cmax - cmin;
    let h = 0;
    let s = 0;
    const l = (cmin + cmax) / 2;
    if (c !== 0) {
        s = c / (1 - Math.abs(cmax + cmin - 1));
        if (rp === cmax) {
            h = (gp - bp) / c;
        }
        else if (gp === cmax) {
            h = 2 + (bp - rp) / c;
        }
        else {
            h = 4 + (rp - gp) / c;
        }
        h = h / 6 + (h < 0 ? 1 : 0);
    }
    return [h * 360, s * 100, l * 100];
}
function hslToRgbInt(h, s, l) {
    const hp = ((h % 360) + 360) % 360;
    const sp = constrainRange(s / 100, 0, 1);
    const lp = constrainRange(l / 100, 0, 1);
    const c = (1 - Math.abs(2 * lp - 1)) * sp;
    const x = c * (1 - Math.abs(((hp / 60) % 2) - 1));
    const m = lp - c / 2;
    let rp, gp, bp;
    if (hp >= 0 && hp < 60) {
        [rp, gp, bp] = [c, x, 0];
    }
    else if (hp >= 60 && hp < 120) {
        [rp, gp, bp] = [x, c, 0];
    }
    else if (hp >= 120 && hp < 180) {
        [rp, gp, bp] = [0, c, x];
    }
    else if (hp >= 180 && hp < 240) {
        [rp, gp, bp] = [0, x, c];
    }
    else if (hp >= 240 && hp < 300) {
        [rp, gp, bp] = [x, 0, c];
    }
    else {
        [rp, gp, bp] = [c, 0, x];
    }
    return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}
function rgbToHsvInt(r, g, b) {
    const rp = constrainRange(r / 255, 0, 1);
    const gp = constrainRange(g / 255, 0, 1);
    const bp = constrainRange(b / 255, 0, 1);
    const cmax = Math.max(rp, gp, bp);
    const cmin = Math.min(rp, gp, bp);
    const d = cmax - cmin;
    let h;
    if (d === 0) {
        h = 0;
    }
    else if (cmax === rp) {
        h = 60 * (((((gp - bp) / d) % 6) + 6) % 6);
    }
    else if (cmax === gp) {
        h = 60 * ((bp - rp) / d + 2);
    }
    else {
        h = 60 * ((rp - gp) / d + 4);
    }
    const s = cmax === 0 ? 0 : d / cmax;
    const v = cmax;
    return [h, s * 100, v * 100];
}
function hsvToRgbInt(h, s, v) {
    const hp = loopRange(h, 360);
    const sp = constrainRange(s / 100, 0, 1);
    const vp = constrainRange(v / 100, 0, 1);
    const c = vp * sp;
    const x = c * (1 - Math.abs(((hp / 60) % 2) - 1));
    const m = vp - c;
    let rp, gp, bp;
    if (hp >= 0 && hp < 60) {
        [rp, gp, bp] = [c, x, 0];
    }
    else if (hp >= 60 && hp < 120) {
        [rp, gp, bp] = [x, c, 0];
    }
    else if (hp >= 120 && hp < 180) {
        [rp, gp, bp] = [0, c, x];
    }
    else if (hp >= 180 && hp < 240) {
        [rp, gp, bp] = [0, x, c];
    }
    else if (hp >= 240 && hp < 300) {
        [rp, gp, bp] = [x, 0, c];
    }
    else {
        [rp, gp, bp] = [c, 0, x];
    }
    return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}
function hslToHsvInt(h, s, l) {
    const sd = l + (s * (100 - Math.abs(2 * l - 100))) / (2 * 100);
    return [
        h,
        sd !== 0 ? (s * (100 - Math.abs(2 * l - 100))) / sd : 0,
        l + (s * (100 - Math.abs(2 * l - 100))) / (2 * 100),
    ];
}
function hsvToHslInt(h, s, v) {
    const sd = 100 - Math.abs((v * (200 - s)) / 100 - 100);
    return [h, sd !== 0 ? (s * v) / sd : 0, (v * (200 - s)) / (2 * 100)];
}
function removeAlphaComponent(comps) {
    return [comps[0], comps[1], comps[2]];
}
function appendAlphaComponent(comps, alpha) {
    return [comps[0], comps[1], comps[2], alpha];
}
const MODE_CONVERTER_MAP = {
    hsl: {
        hsl: (h, s, l) => [h, s, l],
        hsv: hslToHsvInt,
        rgb: hslToRgbInt,
    },
    hsv: {
        hsl: hsvToHslInt,
        hsv: (h, s, v) => [h, s, v],
        rgb: hsvToRgbInt,
    },
    rgb: {
        hsl: rgbToHslInt,
        hsv: rgbToHsvInt,
        rgb: (r, g, b) => [r, g, b],
    },
};
function getColorMaxComponents(mode, type) {
    return [
        type === 'float' ? 1 : mode === 'rgb' ? 255 : 360,
        type === 'float' ? 1 : mode === 'rgb' ? 255 : 100,
        type === 'float' ? 1 : mode === 'rgb' ? 255 : 100,
    ];
}
function loopHueRange(hue, max) {
    return hue === max ? max : loopRange(hue, max);
}
function constrainColorComponents(components, mode, type) {
    var _a;
    const ms = getColorMaxComponents(mode, type);
    return [
        mode === 'rgb'
            ? constrainRange(components[0], 0, ms[0])
            : loopHueRange(components[0], ms[0]),
        constrainRange(components[1], 0, ms[1]),
        constrainRange(components[2], 0, ms[2]),
        constrainRange((_a = components[3]) !== null && _a !== void 0 ? _a : 1, 0, 1),
    ];
}
function convertColorType(comps, mode, from, to) {
    const fms = getColorMaxComponents(mode, from);
    const tms = getColorMaxComponents(mode, to);
    return comps.map((c, index) => (c / fms[index]) * tms[index]);
}
function convertColor(components, from, to) {
    const intComps = convertColorType(components, from.mode, from.type, 'int');
    const result = MODE_CONVERTER_MAP[from.mode][to.mode](...intComps);
    return convertColorType(result, to.mode, 'int', to.type);
}

class IntColor {
    static black() {
        return new IntColor([0, 0, 0], 'rgb');
    }
    constructor(comps, mode) {
        this.type = 'int';
        this.mode = mode;
        this.comps_ = constrainColorComponents(comps, mode, this.type);
    }
    getComponents(opt_mode) {
        return appendAlphaComponent(convertColor(removeAlphaComponent(this.comps_), { mode: this.mode, type: this.type }, { mode: opt_mode !== null && opt_mode !== void 0 ? opt_mode : this.mode, type: this.type }), this.comps_[3]);
    }
    toRgbaObject() {
        const rgbComps = this.getComponents('rgb');
        return {
            r: rgbComps[0],
            g: rgbComps[1],
            b: rgbComps[2],
            a: rgbComps[3],
        };
    }
}

const cn$d = ClassName('colp');
class ColorPickerView {
    constructor(doc, config) {
        this.alphaViews_ = null;
        this.element = doc.createElement('div');
        this.element.classList.add(cn$d());
        config.viewProps.bindClassModifiers(this.element);
        const hsvElem = doc.createElement('div');
        hsvElem.classList.add(cn$d('hsv'));
        const svElem = doc.createElement('div');
        svElem.classList.add(cn$d('sv'));
        this.svPaletteView_ = config.svPaletteView;
        svElem.appendChild(this.svPaletteView_.element);
        hsvElem.appendChild(svElem);
        const hElem = doc.createElement('div');
        hElem.classList.add(cn$d('h'));
        this.hPaletteView_ = config.hPaletteView;
        hElem.appendChild(this.hPaletteView_.element);
        hsvElem.appendChild(hElem);
        this.element.appendChild(hsvElem);
        const rgbElem = doc.createElement('div');
        rgbElem.classList.add(cn$d('rgb'));
        this.textsView_ = config.textsView;
        rgbElem.appendChild(this.textsView_.element);
        this.element.appendChild(rgbElem);
        if (config.alphaViews) {
            this.alphaViews_ = {
                palette: config.alphaViews.palette,
                text: config.alphaViews.text,
            };
            const aElem = doc.createElement('div');
            aElem.classList.add(cn$d('a'));
            const apElem = doc.createElement('div');
            apElem.classList.add(cn$d('ap'));
            apElem.appendChild(this.alphaViews_.palette.element);
            aElem.appendChild(apElem);
            const atElem = doc.createElement('div');
            atElem.classList.add(cn$d('at'));
            atElem.appendChild(this.alphaViews_.text.element);
            aElem.appendChild(atElem);
            this.element.appendChild(aElem);
        }
    }
    get allFocusableElements() {
        const elems = [
            this.svPaletteView_.element,
            this.hPaletteView_.element,
            this.textsView_.modeSelectElement,
            ...this.textsView_.inputViews.map((v) => v.inputElement),
        ];
        if (this.alphaViews_) {
            elems.push(this.alphaViews_.palette.element, this.alphaViews_.text.inputElement);
        }
        return elems;
    }
}

function parseColorType(value) {
    return value === 'int' ? 'int' : value === 'float' ? 'float' : undefined;
}
function parseColorInputParams(params) {
    return parseRecord(params, (p) => ({
        color: p.optional.object({
            alpha: p.optional.boolean,
            type: p.optional.custom(parseColorType),
        }),
        expanded: p.optional.boolean,
        picker: p.optional.custom(parsePickerLayout),
        readonly: p.optional.constant(false),
    }));
}
function getKeyScaleForColor(forAlpha) {
    return forAlpha ? 0.1 : 1;
}
function extractColorType(params) {
    var _a;
    return (_a = params.color) === null || _a === void 0 ? void 0 : _a.type;
}

class FloatColor {
    constructor(comps, mode) {
        this.type = 'float';
        this.mode = mode;
        this.comps_ = constrainColorComponents(comps, mode, this.type);
    }
    getComponents(opt_mode) {
        return appendAlphaComponent(convertColor(removeAlphaComponent(this.comps_), { mode: this.mode, type: this.type }, { mode: opt_mode !== null && opt_mode !== void 0 ? opt_mode : this.mode, type: this.type }), this.comps_[3]);
    }
    toRgbaObject() {
        const rgbComps = this.getComponents('rgb');
        return {
            r: rgbComps[0],
            g: rgbComps[1],
            b: rgbComps[2],
            a: rgbComps[3],
        };
    }
}

const TYPE_TO_CONSTRUCTOR_MAP = {
    int: (comps, mode) => new IntColor(comps, mode),
    float: (comps, mode) => new FloatColor(comps, mode),
};
function createColor(comps, mode, type) {
    return TYPE_TO_CONSTRUCTOR_MAP[type](comps, mode);
}
function isFloatColor(c) {
    return c.type === 'float';
}
function isIntColor(c) {
    return c.type === 'int';
}
function convertFloatToInt(cf) {
    const comps = cf.getComponents();
    const ms = getColorMaxComponents(cf.mode, 'int');
    return new IntColor([
        Math.round(mapRange$1(comps[0], 0, 1, 0, ms[0])),
        Math.round(mapRange$1(comps[1], 0, 1, 0, ms[1])),
        Math.round(mapRange$1(comps[2], 0, 1, 0, ms[2])),
        comps[3],
    ], cf.mode);
}
function convertIntToFloat(ci) {
    const comps = ci.getComponents();
    const ms = getColorMaxComponents(ci.mode, 'int');
    return new FloatColor([
        mapRange$1(comps[0], 0, ms[0], 0, 1),
        mapRange$1(comps[1], 0, ms[1], 0, 1),
        mapRange$1(comps[2], 0, ms[2], 0, 1),
        comps[3],
    ], ci.mode);
}
function mapColorType(c, type) {
    if (c.type === type) {
        return c;
    }
    if (isIntColor(c) && type === 'float') {
        return convertIntToFloat(c);
    }
    if (isFloatColor(c) && type === 'int') {
        return convertFloatToInt(c);
    }
    throw TpError.shouldNeverHappen();
}

function equalsStringColorFormat(f1, f2) {
    return (f1.alpha === f2.alpha &&
        f1.mode === f2.mode &&
        f1.notation === f2.notation &&
        f1.type === f2.type);
}
function parseCssNumberOrPercentage(text, max) {
    const m = text.match(/^(.+)%$/);
    if (!m) {
        return Math.min(parseFloat(text), max);
    }
    return Math.min(parseFloat(m[1]) * 0.01 * max, max);
}
const ANGLE_TO_DEG_MAP = {
    deg: (angle) => angle,
    grad: (angle) => (angle * 360) / 400,
    rad: (angle) => (angle * 360) / (2 * Math.PI),
    turn: (angle) => angle * 360,
};
function parseCssNumberOrAngle(text) {
    const m = text.match(/^([0-9.]+?)(deg|grad|rad|turn)$/);
    if (!m) {
        return parseFloat(text);
    }
    const angle = parseFloat(m[1]);
    const unit = m[2];
    return ANGLE_TO_DEG_MAP[unit](angle);
}
function parseFunctionalRgbColorComponents(text) {
    const m = text.match(/^rgb\(\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*\)$/);
    if (!m) {
        return null;
    }
    const comps = [
        parseCssNumberOrPercentage(m[1], 255),
        parseCssNumberOrPercentage(m[2], 255),
        parseCssNumberOrPercentage(m[3], 255),
    ];
    if (isNaN(comps[0]) || isNaN(comps[1]) || isNaN(comps[2])) {
        return null;
    }
    return comps;
}
function parseFunctionalRgbColor(text) {
    const comps = parseFunctionalRgbColorComponents(text);
    return comps ? new IntColor(comps, 'rgb') : null;
}
function parseFunctionalRgbaColorComponents(text) {
    const m = text.match(/^rgba\(\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*\)$/);
    if (!m) {
        return null;
    }
    const comps = [
        parseCssNumberOrPercentage(m[1], 255),
        parseCssNumberOrPercentage(m[2], 255),
        parseCssNumberOrPercentage(m[3], 255),
        parseCssNumberOrPercentage(m[4], 1),
    ];
    if (isNaN(comps[0]) ||
        isNaN(comps[1]) ||
        isNaN(comps[2]) ||
        isNaN(comps[3])) {
        return null;
    }
    return comps;
}
function parseFunctionalRgbaColor(text) {
    const comps = parseFunctionalRgbaColorComponents(text);
    return comps ? new IntColor(comps, 'rgb') : null;
}
function parseFunctionalHslColorComponents(text) {
    const m = text.match(/^hsl\(\s*([0-9A-Fa-f.]+(?:deg|grad|rad|turn)?)\s*,\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*\)$/);
    if (!m) {
        return null;
    }
    const comps = [
        parseCssNumberOrAngle(m[1]),
        parseCssNumberOrPercentage(m[2], 100),
        parseCssNumberOrPercentage(m[3], 100),
    ];
    if (isNaN(comps[0]) || isNaN(comps[1]) || isNaN(comps[2])) {
        return null;
    }
    return comps;
}
function parseFunctionalHslColor(text) {
    const comps = parseFunctionalHslColorComponents(text);
    return comps ? new IntColor(comps, 'hsl') : null;
}
function parseHslaColorComponents(text) {
    const m = text.match(/^hsla\(\s*([0-9A-Fa-f.]+(?:deg|grad|rad|turn)?)\s*,\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*\)$/);
    if (!m) {
        return null;
    }
    const comps = [
        parseCssNumberOrAngle(m[1]),
        parseCssNumberOrPercentage(m[2], 100),
        parseCssNumberOrPercentage(m[3], 100),
        parseCssNumberOrPercentage(m[4], 1),
    ];
    if (isNaN(comps[0]) ||
        isNaN(comps[1]) ||
        isNaN(comps[2]) ||
        isNaN(comps[3])) {
        return null;
    }
    return comps;
}
function parseFunctionalHslaColor(text) {
    const comps = parseHslaColorComponents(text);
    return comps ? new IntColor(comps, 'hsl') : null;
}
function parseHexRgbColorComponents(text) {
    const mRgb = text.match(/^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/);
    if (mRgb) {
        return [
            parseInt(mRgb[1] + mRgb[1], 16),
            parseInt(mRgb[2] + mRgb[2], 16),
            parseInt(mRgb[3] + mRgb[3], 16),
        ];
    }
    const mRrggbb = text.match(/^(?:#|0x)([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
    if (mRrggbb) {
        return [
            parseInt(mRrggbb[1], 16),
            parseInt(mRrggbb[2], 16),
            parseInt(mRrggbb[3], 16),
        ];
    }
    return null;
}
function parseHexRgbColor(text) {
    const comps = parseHexRgbColorComponents(text);
    return comps ? new IntColor(comps, 'rgb') : null;
}
function parseHexRgbaColorComponents(text) {
    const mRgb = text.match(/^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/);
    if (mRgb) {
        return [
            parseInt(mRgb[1] + mRgb[1], 16),
            parseInt(mRgb[2] + mRgb[2], 16),
            parseInt(mRgb[3] + mRgb[3], 16),
            mapRange$1(parseInt(mRgb[4] + mRgb[4], 16), 0, 255, 0, 1),
        ];
    }
    const mRrggbb = text.match(/^(?:#|0x)?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
    if (mRrggbb) {
        return [
            parseInt(mRrggbb[1], 16),
            parseInt(mRrggbb[2], 16),
            parseInt(mRrggbb[3], 16),
            mapRange$1(parseInt(mRrggbb[4], 16), 0, 255, 0, 1),
        ];
    }
    return null;
}
function parseHexRgbaColor(text) {
    const comps = parseHexRgbaColorComponents(text);
    return comps ? new IntColor(comps, 'rgb') : null;
}
function parseObjectRgbColorComponents(text) {
    const m = text.match(/^\{\s*r\s*:\s*([0-9A-Fa-f.]+%?)\s*,\s*g\s*:\s*([0-9A-Fa-f.]+%?)\s*,\s*b\s*:\s*([0-9A-Fa-f.]+%?)\s*\}$/);
    if (!m) {
        return null;
    }
    const comps = [
        parseFloat(m[1]),
        parseFloat(m[2]),
        parseFloat(m[3]),
    ];
    if (isNaN(comps[0]) || isNaN(comps[1]) || isNaN(comps[2])) {
        return null;
    }
    return comps;
}
function createObjectRgbColorParser(type) {
    return (text) => {
        const comps = parseObjectRgbColorComponents(text);
        return comps ? createColor(comps, 'rgb', type) : null;
    };
}
function parseObjectRgbaColorComponents(text) {
    const m = text.match(/^\{\s*r\s*:\s*([0-9A-Fa-f.]+%?)\s*,\s*g\s*:\s*([0-9A-Fa-f.]+%?)\s*,\s*b\s*:\s*([0-9A-Fa-f.]+%?)\s*,\s*a\s*:\s*([0-9A-Fa-f.]+%?)\s*\}$/);
    if (!m) {
        return null;
    }
    const comps = [
        parseFloat(m[1]),
        parseFloat(m[2]),
        parseFloat(m[3]),
        parseFloat(m[4]),
    ];
    if (isNaN(comps[0]) ||
        isNaN(comps[1]) ||
        isNaN(comps[2]) ||
        isNaN(comps[3])) {
        return null;
    }
    return comps;
}
function createObjectRgbaColorParser(type) {
    return (text) => {
        const comps = parseObjectRgbaColorComponents(text);
        return comps ? createColor(comps, 'rgb', type) : null;
    };
}
const PARSER_AND_RESULT = [
    {
        parser: parseHexRgbColorComponents,
        result: {
            alpha: false,
            mode: 'rgb',
            notation: 'hex',
        },
    },
    {
        parser: parseHexRgbaColorComponents,
        result: {
            alpha: true,
            mode: 'rgb',
            notation: 'hex',
        },
    },
    {
        parser: parseFunctionalRgbColorComponents,
        result: {
            alpha: false,
            mode: 'rgb',
            notation: 'func',
        },
    },
    {
        parser: parseFunctionalRgbaColorComponents,
        result: {
            alpha: true,
            mode: 'rgb',
            notation: 'func',
        },
    },
    {
        parser: parseFunctionalHslColorComponents,
        result: {
            alpha: false,
            mode: 'hsl',
            notation: 'func',
        },
    },
    {
        parser: parseHslaColorComponents,
        result: {
            alpha: true,
            mode: 'hsl',
            notation: 'func',
        },
    },
    {
        parser: parseObjectRgbColorComponents,
        result: {
            alpha: false,
            mode: 'rgb',
            notation: 'object',
        },
    },
    {
        parser: parseObjectRgbaColorComponents,
        result: {
            alpha: true,
            mode: 'rgb',
            notation: 'object',
        },
    },
];
function detectStringColor(text) {
    return PARSER_AND_RESULT.reduce((prev, { parser, result: detection }) => {
        if (prev) {
            return prev;
        }
        return parser(text) ? detection : null;
    }, null);
}
function detectStringColorFormat(text, type = 'int') {
    const r = detectStringColor(text);
    if (!r) {
        return null;
    }
    if (r.notation === 'hex' && type !== 'float') {
        return Object.assign(Object.assign({}, r), { type: 'int' });
    }
    if (r.notation === 'func') {
        return Object.assign(Object.assign({}, r), { type: type });
    }
    return null;
}
function createColorStringParser(type) {
    const parsers = [
        parseHexRgbColor,
        parseHexRgbaColor,
        parseFunctionalRgbColor,
        parseFunctionalRgbaColor,
        parseFunctionalHslColor,
        parseFunctionalHslaColor,
    ];
    if (type === 'int') {
        parsers.push(createObjectRgbColorParser('int'), createObjectRgbaColorParser('int'));
    }
    if (type === 'float') {
        parsers.push(createObjectRgbColorParser('float'), createObjectRgbaColorParser('float'));
    }
    const parser = composeParsers(parsers);
    return (text) => {
        const result = parser(text);
        return result ? mapColorType(result, type) : null;
    };
}
function readIntColorString(value) {
    const parser = createColorStringParser('int');
    if (typeof value !== 'string') {
        return IntColor.black();
    }
    const result = parser(value);
    return result !== null && result !== void 0 ? result : IntColor.black();
}
function zerofill(comp) {
    const hex = constrainRange(Math.floor(comp), 0, 255).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
}
function colorToHexRgbString(value, prefix = '#') {
    const hexes = removeAlphaComponent(value.getComponents('rgb'))
        .map(zerofill)
        .join('');
    return `${prefix}${hexes}`;
}
function colorToHexRgbaString(value, prefix = '#') {
    const rgbaComps = value.getComponents('rgb');
    const hexes = [rgbaComps[0], rgbaComps[1], rgbaComps[2], rgbaComps[3] * 255]
        .map(zerofill)
        .join('');
    return `${prefix}${hexes}`;
}
function colorToFunctionalRgbString(value) {
    const formatter = createNumberFormatter(0);
    const ci = mapColorType(value, 'int');
    const comps = removeAlphaComponent(ci.getComponents('rgb')).map((comp) => formatter(comp));
    return `rgb(${comps.join(', ')})`;
}
function colorToFunctionalRgbaString(value) {
    const aFormatter = createNumberFormatter(2);
    const rgbFormatter = createNumberFormatter(0);
    const ci = mapColorType(value, 'int');
    const comps = ci.getComponents('rgb').map((comp, index) => {
        const formatter = index === 3 ? aFormatter : rgbFormatter;
        return formatter(comp);
    });
    return `rgba(${comps.join(', ')})`;
}
function colorToFunctionalHslString(value) {
    const formatters = [
        createNumberFormatter(0),
        formatPercentage,
        formatPercentage,
    ];
    const ci = mapColorType(value, 'int');
    const comps = removeAlphaComponent(ci.getComponents('hsl')).map((comp, index) => formatters[index](comp));
    return `hsl(${comps.join(', ')})`;
}
function colorToFunctionalHslaString(value) {
    const formatters = [
        createNumberFormatter(0),
        formatPercentage,
        formatPercentage,
        createNumberFormatter(2),
    ];
    const ci = mapColorType(value, 'int');
    const comps = ci
        .getComponents('hsl')
        .map((comp, index) => formatters[index](comp));
    return `hsla(${comps.join(', ')})`;
}
function colorToObjectRgbString(value, type) {
    const formatter = createNumberFormatter(type === 'float' ? 2 : 0);
    const names = ['r', 'g', 'b'];
    const cc = mapColorType(value, type);
    const comps = removeAlphaComponent(cc.getComponents('rgb')).map((comp, index) => `${names[index]}: ${formatter(comp)}`);
    return `{${comps.join(', ')}}`;
}
function createObjectRgbColorFormatter(type) {
    return (value) => colorToObjectRgbString(value, type);
}
function colorToObjectRgbaString(value, type) {
    const aFormatter = createNumberFormatter(2);
    const rgbFormatter = createNumberFormatter(type === 'float' ? 2 : 0);
    const names = ['r', 'g', 'b', 'a'];
    const cc = mapColorType(value, type);
    const comps = cc.getComponents('rgb').map((comp, index) => {
        const formatter = index === 3 ? aFormatter : rgbFormatter;
        return `${names[index]}: ${formatter(comp)}`;
    });
    return `{${comps.join(', ')}}`;
}
function createObjectRgbaColorFormatter(type) {
    return (value) => colorToObjectRgbaString(value, type);
}
const FORMAT_AND_STRINGIFIERS = [
    {
        format: {
            alpha: false,
            mode: 'rgb',
            notation: 'hex',
            type: 'int',
        },
        stringifier: colorToHexRgbString,
    },
    {
        format: {
            alpha: true,
            mode: 'rgb',
            notation: 'hex',
            type: 'int',
        },
        stringifier: colorToHexRgbaString,
    },
    {
        format: {
            alpha: false,
            mode: 'rgb',
            notation: 'func',
            type: 'int',
        },
        stringifier: colorToFunctionalRgbString,
    },
    {
        format: {
            alpha: true,
            mode: 'rgb',
            notation: 'func',
            type: 'int',
        },
        stringifier: colorToFunctionalRgbaString,
    },
    {
        format: {
            alpha: false,
            mode: 'hsl',
            notation: 'func',
            type: 'int',
        },
        stringifier: colorToFunctionalHslString,
    },
    {
        format: {
            alpha: true,
            mode: 'hsl',
            notation: 'func',
            type: 'int',
        },
        stringifier: colorToFunctionalHslaString,
    },
    ...['int', 'float'].reduce((prev, type) => {
        return [
            ...prev,
            {
                format: {
                    alpha: false,
                    mode: 'rgb',
                    notation: 'object',
                    type: type,
                },
                stringifier: createObjectRgbColorFormatter(type),
            },
            {
                format: {
                    alpha: true,
                    mode: 'rgb',
                    notation: 'object',
                    type: type,
                },
                stringifier: createObjectRgbaColorFormatter(type),
            },
        ];
    }, []),
];
function findColorStringifier(format) {
    return FORMAT_AND_STRINGIFIERS.reduce((prev, fas) => {
        if (prev) {
            return prev;
        }
        return equalsStringColorFormat(fas.format, format)
            ? fas.stringifier
            : null;
    }, null);
}

const cn$c = ClassName('apl');
class APaletteView {
    constructor(doc, config) {
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.value = config.value;
        this.value.emitter.on('change', this.onValueChange_);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$c());
        config.viewProps.bindClassModifiers(this.element);
        config.viewProps.bindTabIndex(this.element);
        const barElem = doc.createElement('div');
        barElem.classList.add(cn$c('b'));
        this.element.appendChild(barElem);
        const colorElem = doc.createElement('div');
        colorElem.classList.add(cn$c('c'));
        barElem.appendChild(colorElem);
        this.colorElem_ = colorElem;
        const markerElem = doc.createElement('div');
        markerElem.classList.add(cn$c('m'));
        this.element.appendChild(markerElem);
        this.markerElem_ = markerElem;
        const previewElem = doc.createElement('div');
        previewElem.classList.add(cn$c('p'));
        this.markerElem_.appendChild(previewElem);
        this.previewElem_ = previewElem;
        this.update_();
    }
    update_() {
        const c = this.value.rawValue;
        const rgbaComps = c.getComponents('rgb');
        const leftColor = new IntColor([rgbaComps[0], rgbaComps[1], rgbaComps[2], 0], 'rgb');
        const rightColor = new IntColor([rgbaComps[0], rgbaComps[1], rgbaComps[2], 255], 'rgb');
        const gradientComps = [
            'to right',
            colorToFunctionalRgbaString(leftColor),
            colorToFunctionalRgbaString(rightColor),
        ];
        this.colorElem_.style.background = `linear-gradient(${gradientComps.join(',')})`;
        this.previewElem_.style.backgroundColor = colorToFunctionalRgbaString(c);
        const left = mapRange$1(rgbaComps[3], 0, 1, 0, 100);
        this.markerElem_.style.left = `${left}%`;
    }
    onValueChange_() {
        this.update_();
    }
}

class APaletteController {
    constructor(doc, config) {
        this.onKeyDown_ = this.onKeyDown_.bind(this);
        this.onKeyUp_ = this.onKeyUp_.bind(this);
        this.onPointerDown_ = this.onPointerDown_.bind(this);
        this.onPointerMove_ = this.onPointerMove_.bind(this);
        this.onPointerUp_ = this.onPointerUp_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new APaletteView(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        this.ptHandler_ = new PointerHandler(this.view.element);
        this.ptHandler_.emitter.on('down', this.onPointerDown_);
        this.ptHandler_.emitter.on('move', this.onPointerMove_);
        this.ptHandler_.emitter.on('up', this.onPointerUp_);
        this.view.element.addEventListener('keydown', this.onKeyDown_);
        this.view.element.addEventListener('keyup', this.onKeyUp_);
    }
    handlePointerEvent_(d, opts) {
        if (!d.point) {
            return;
        }
        const alpha = d.point.x / d.bounds.width;
        const c = this.value.rawValue;
        const [h, s, v] = c.getComponents('hsv');
        this.value.setRawValue(new IntColor([h, s, v, alpha], 'hsv'), opts);
    }
    onPointerDown_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerMove_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerUp_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: true,
            last: true,
        });
    }
    onKeyDown_(ev) {
        const step = getStepForKey(getKeyScaleForColor(true), getHorizontalStepKeys(ev));
        if (step === 0) {
            return;
        }
        const c = this.value.rawValue;
        const [h, s, v, a] = c.getComponents('hsv');
        this.value.setRawValue(new IntColor([h, s, v, a + step], 'hsv'), {
            forceEmit: false,
            last: false,
        });
    }
    onKeyUp_(ev) {
        const step = getStepForKey(getKeyScaleForColor(true), getHorizontalStepKeys(ev));
        if (step === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue, {
            forceEmit: true,
            last: true,
        });
    }
}

const cn$b = ClassName('coltxt');
function createModeSelectElement(doc) {
    const selectElem = doc.createElement('select');
    const items = [
        { text: 'RGB', value: 'rgb' },
        { text: 'HSL', value: 'hsl' },
        { text: 'HSV', value: 'hsv' },
        { text: 'HEX', value: 'hex' },
    ];
    selectElem.appendChild(items.reduce((frag, item) => {
        const optElem = doc.createElement('option');
        optElem.textContent = item.text;
        optElem.value = item.value;
        frag.appendChild(optElem);
        return frag;
    }, doc.createDocumentFragment()));
    return selectElem;
}
class ColorTextsView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$b());
        config.viewProps.bindClassModifiers(this.element);
        const modeElem = doc.createElement('div');
        modeElem.classList.add(cn$b('m'));
        this.modeElem_ = createModeSelectElement(doc);
        this.modeElem_.classList.add(cn$b('ms'));
        modeElem.appendChild(this.modeSelectElement);
        config.viewProps.bindDisabled(this.modeElem_);
        const modeMarkerElem = doc.createElement('div');
        modeMarkerElem.classList.add(cn$b('mm'));
        modeMarkerElem.appendChild(createSvgIconElement(doc, 'dropdown'));
        modeElem.appendChild(modeMarkerElem);
        this.element.appendChild(modeElem);
        const inputsElem = doc.createElement('div');
        inputsElem.classList.add(cn$b('w'));
        this.element.appendChild(inputsElem);
        this.inputsElem_ = inputsElem;
        this.inputViews_ = config.inputViews;
        this.applyInputViews_();
        bindValue(config.mode, (mode) => {
            this.modeElem_.value = mode;
        });
    }
    get modeSelectElement() {
        return this.modeElem_;
    }
    get inputViews() {
        return this.inputViews_;
    }
    set inputViews(inputViews) {
        this.inputViews_ = inputViews;
        this.applyInputViews_();
    }
    applyInputViews_() {
        removeChildElements(this.inputsElem_);
        const doc = this.element.ownerDocument;
        this.inputViews_.forEach((v) => {
            const compElem = doc.createElement('div');
            compElem.classList.add(cn$b('c'));
            compElem.appendChild(v.element);
            this.inputsElem_.appendChild(compElem);
        });
    }
}

function createFormatter$2(type) {
    return createNumberFormatter(type === 'float' ? 2 : 0);
}
function createConstraint$5(mode, type, index) {
    const max = getColorMaxComponents(mode, type)[index];
    return new DefiniteRangeConstraint({
        min: 0,
        max: max,
    });
}
function createComponentController(doc, config, index) {
    return new NumberTextController(doc, {
        arrayPosition: index === 0 ? 'fst' : index === 3 - 1 ? 'lst' : 'mid',
        parser: config.parser,
        props: ValueMap.fromObject({
            formatter: createFormatter$2(config.colorType),
            keyScale: getKeyScaleForColor(false),
            pointerScale: config.colorType === 'float' ? 0.01 : 1,
        }),
        value: createValue(0, {
            constraint: createConstraint$5(config.colorMode, config.colorType, index),
        }),
        viewProps: config.viewProps,
    });
}
function createComponentControllers(doc, config) {
    const cc = {
        colorMode: config.colorMode,
        colorType: config.colorType,
        parser: parseNumber,
        viewProps: config.viewProps,
    };
    return [0, 1, 2].map((i) => {
        const c = createComponentController(doc, cc, i);
        connectValues({
            primary: config.value,
            secondary: c.value,
            forward(p) {
                const mc = mapColorType(p, config.colorType);
                return mc.getComponents(config.colorMode)[i];
            },
            backward(p, s) {
                const pickedMode = config.colorMode;
                const mc = mapColorType(p, config.colorType);
                const comps = mc.getComponents(pickedMode);
                comps[i] = s;
                const c = createColor(appendAlphaComponent(removeAlphaComponent(comps), comps[3]), pickedMode, config.colorType);
                return mapColorType(c, 'int');
            },
        });
        return c;
    });
}
function createHexController(doc, config) {
    const c = new TextController(doc, {
        parser: createColorStringParser('int'),
        props: ValueMap.fromObject({
            formatter: colorToHexRgbString,
        }),
        value: createValue(IntColor.black()),
        viewProps: config.viewProps,
    });
    connectValues({
        primary: config.value,
        secondary: c.value,
        forward: (p) => new IntColor(removeAlphaComponent(p.getComponents()), p.mode),
        backward: (p, s) => new IntColor(appendAlphaComponent(removeAlphaComponent(s.getComponents(p.mode)), p.getComponents()[3]), p.mode),
    });
    return [c];
}
function isColorMode(mode) {
    return mode !== 'hex';
}
class ColorTextsController {
    constructor(doc, config) {
        this.onModeSelectChange_ = this.onModeSelectChange_.bind(this);
        this.colorType_ = config.colorType;
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.colorMode = createValue(this.value.rawValue.mode);
        this.ccs_ = this.createComponentControllers_(doc);
        this.view = new ColorTextsView(doc, {
            mode: this.colorMode,
            inputViews: [this.ccs_[0].view, this.ccs_[1].view, this.ccs_[2].view],
            viewProps: this.viewProps,
        });
        this.view.modeSelectElement.addEventListener('change', this.onModeSelectChange_);
    }
    createComponentControllers_(doc) {
        const mode = this.colorMode.rawValue;
        if (isColorMode(mode)) {
            return createComponentControllers(doc, {
                colorMode: mode,
                colorType: this.colorType_,
                value: this.value,
                viewProps: this.viewProps,
            });
        }
        return createHexController(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
    }
    onModeSelectChange_(ev) {
        const selectElem = ev.currentTarget;
        this.colorMode.rawValue = selectElem.value;
        this.ccs_ = this.createComponentControllers_(this.view.element.ownerDocument);
        this.view.inputViews = this.ccs_.map((cc) => cc.view);
    }
}

const cn$a = ClassName('hpl');
class HPaletteView {
    constructor(doc, config) {
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.value = config.value;
        this.value.emitter.on('change', this.onValueChange_);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$a());
        config.viewProps.bindClassModifiers(this.element);
        config.viewProps.bindTabIndex(this.element);
        const colorElem = doc.createElement('div');
        colorElem.classList.add(cn$a('c'));
        this.element.appendChild(colorElem);
        const markerElem = doc.createElement('div');
        markerElem.classList.add(cn$a('m'));
        this.element.appendChild(markerElem);
        this.markerElem_ = markerElem;
        this.update_();
    }
    update_() {
        const c = this.value.rawValue;
        const [h] = c.getComponents('hsv');
        this.markerElem_.style.backgroundColor = colorToFunctionalRgbString(new IntColor([h, 100, 100], 'hsv'));
        const left = mapRange$1(h, 0, 360, 0, 100);
        this.markerElem_.style.left = `${left}%`;
    }
    onValueChange_() {
        this.update_();
    }
}

class HPaletteController {
    constructor(doc, config) {
        this.onKeyDown_ = this.onKeyDown_.bind(this);
        this.onKeyUp_ = this.onKeyUp_.bind(this);
        this.onPointerDown_ = this.onPointerDown_.bind(this);
        this.onPointerMove_ = this.onPointerMove_.bind(this);
        this.onPointerUp_ = this.onPointerUp_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new HPaletteView(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        this.ptHandler_ = new PointerHandler(this.view.element);
        this.ptHandler_.emitter.on('down', this.onPointerDown_);
        this.ptHandler_.emitter.on('move', this.onPointerMove_);
        this.ptHandler_.emitter.on('up', this.onPointerUp_);
        this.view.element.addEventListener('keydown', this.onKeyDown_);
        this.view.element.addEventListener('keyup', this.onKeyUp_);
    }
    handlePointerEvent_(d, opts) {
        if (!d.point) {
            return;
        }
        const hue = mapRange$1(constrainRange(d.point.x, 0, d.bounds.width), 0, d.bounds.width, 0, 360);
        const c = this.value.rawValue;
        const [, s, v, a] = c.getComponents('hsv');
        this.value.setRawValue(new IntColor([hue, s, v, a], 'hsv'), opts);
    }
    onPointerDown_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerMove_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerUp_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: true,
            last: true,
        });
    }
    onKeyDown_(ev) {
        const step = getStepForKey(getKeyScaleForColor(false), getHorizontalStepKeys(ev));
        if (step === 0) {
            return;
        }
        const c = this.value.rawValue;
        const [h, s, v, a] = c.getComponents('hsv');
        this.value.setRawValue(new IntColor([h + step, s, v, a], 'hsv'), {
            forceEmit: false,
            last: false,
        });
    }
    onKeyUp_(ev) {
        const step = getStepForKey(getKeyScaleForColor(false), getHorizontalStepKeys(ev));
        if (step === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue, {
            forceEmit: true,
            last: true,
        });
    }
}

const cn$9 = ClassName('svp');
const CANVAS_RESOL = 64;
class SvPaletteView {
    constructor(doc, config) {
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.value = config.value;
        this.value.emitter.on('change', this.onValueChange_);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$9());
        config.viewProps.bindClassModifiers(this.element);
        config.viewProps.bindTabIndex(this.element);
        const canvasElem = doc.createElement('canvas');
        canvasElem.height = CANVAS_RESOL;
        canvasElem.width = CANVAS_RESOL;
        canvasElem.classList.add(cn$9('c'));
        this.element.appendChild(canvasElem);
        this.canvasElement = canvasElem;
        const markerElem = doc.createElement('div');
        markerElem.classList.add(cn$9('m'));
        this.element.appendChild(markerElem);
        this.markerElem_ = markerElem;
        this.update_();
    }
    update_() {
        const ctx = getCanvasContext(this.canvasElement);
        if (!ctx) {
            return;
        }
        const c = this.value.rawValue;
        const hsvComps = c.getComponents('hsv');
        const width = this.canvasElement.width;
        const height = this.canvasElement.height;
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        for (let iy = 0; iy < height; iy++) {
            for (let ix = 0; ix < width; ix++) {
                const s = mapRange$1(ix, 0, width, 0, 100);
                const v = mapRange$1(iy, 0, height, 100, 0);
                const rgbComps = hsvToRgbInt(hsvComps[0], s, v);
                const i = (iy * width + ix) * 4;
                data[i] = rgbComps[0];
                data[i + 1] = rgbComps[1];
                data[i + 2] = rgbComps[2];
                data[i + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        const left = mapRange$1(hsvComps[1], 0, 100, 0, 100);
        this.markerElem_.style.left = `${left}%`;
        const top = mapRange$1(hsvComps[2], 0, 100, 100, 0);
        this.markerElem_.style.top = `${top}%`;
    }
    onValueChange_() {
        this.update_();
    }
}

class SvPaletteController {
    constructor(doc, config) {
        this.onKeyDown_ = this.onKeyDown_.bind(this);
        this.onKeyUp_ = this.onKeyUp_.bind(this);
        this.onPointerDown_ = this.onPointerDown_.bind(this);
        this.onPointerMove_ = this.onPointerMove_.bind(this);
        this.onPointerUp_ = this.onPointerUp_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new SvPaletteView(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        this.ptHandler_ = new PointerHandler(this.view.element);
        this.ptHandler_.emitter.on('down', this.onPointerDown_);
        this.ptHandler_.emitter.on('move', this.onPointerMove_);
        this.ptHandler_.emitter.on('up', this.onPointerUp_);
        this.view.element.addEventListener('keydown', this.onKeyDown_);
        this.view.element.addEventListener('keyup', this.onKeyUp_);
    }
    handlePointerEvent_(d, opts) {
        if (!d.point) {
            return;
        }
        const saturation = mapRange$1(d.point.x, 0, d.bounds.width, 0, 100);
        const value = mapRange$1(d.point.y, 0, d.bounds.height, 100, 0);
        const [h, , , a] = this.value.rawValue.getComponents('hsv');
        this.value.setRawValue(new IntColor([h, saturation, value, a], 'hsv'), opts);
    }
    onPointerDown_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerMove_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerUp_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: true,
            last: true,
        });
    }
    onKeyDown_(ev) {
        if (isArrowKey(ev.key)) {
            ev.preventDefault();
        }
        const [h, s, v, a] = this.value.rawValue.getComponents('hsv');
        const keyScale = getKeyScaleForColor(false);
        const ds = getStepForKey(keyScale, getHorizontalStepKeys(ev));
        const dv = getStepForKey(keyScale, getVerticalStepKeys(ev));
        if (ds === 0 && dv === 0) {
            return;
        }
        this.value.setRawValue(new IntColor([h, s + ds, v + dv, a], 'hsv'), {
            forceEmit: false,
            last: false,
        });
    }
    onKeyUp_(ev) {
        const keyScale = getKeyScaleForColor(false);
        const ds = getStepForKey(keyScale, getHorizontalStepKeys(ev));
        const dv = getStepForKey(keyScale, getVerticalStepKeys(ev));
        if (ds === 0 && dv === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue, {
            forceEmit: true,
            last: true,
        });
    }
}

class ColorPickerController {
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.hPaletteC_ = new HPaletteController(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        this.svPaletteC_ = new SvPaletteController(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        this.alphaIcs_ = config.supportsAlpha
            ? {
                palette: new APaletteController(doc, {
                    value: this.value,
                    viewProps: this.viewProps,
                }),
                text: new NumberTextController(doc, {
                    parser: parseNumber,
                    props: ValueMap.fromObject({
                        pointerScale: 0.01,
                        keyScale: 0.1,
                        formatter: createNumberFormatter(2),
                    }),
                    value: createValue(0, {
                        constraint: new DefiniteRangeConstraint({ min: 0, max: 1 }),
                    }),
                    viewProps: this.viewProps,
                }),
            }
            : null;
        if (this.alphaIcs_) {
            connectValues({
                primary: this.value,
                secondary: this.alphaIcs_.text.value,
                forward: (p) => p.getComponents()[3],
                backward: (p, s) => {
                    const comps = p.getComponents();
                    comps[3] = s;
                    return new IntColor(comps, p.mode);
                },
            });
        }
        this.textsC_ = new ColorTextsController(doc, {
            colorType: config.colorType,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view = new ColorPickerView(doc, {
            alphaViews: this.alphaIcs_
                ? {
                    palette: this.alphaIcs_.palette.view,
                    text: this.alphaIcs_.text.view,
                }
                : null,
            hPaletteView: this.hPaletteC_.view,
            supportsAlpha: config.supportsAlpha,
            svPaletteView: this.svPaletteC_.view,
            textsView: this.textsC_.view,
            viewProps: this.viewProps,
        });
    }
    get textsController() {
        return this.textsC_;
    }
}

const cn$8 = ClassName('colsw');
class ColorSwatchView {
    constructor(doc, config) {
        this.onValueChange_ = this.onValueChange_.bind(this);
        config.value.emitter.on('change', this.onValueChange_);
        this.value = config.value;
        this.element = doc.createElement('div');
        this.element.classList.add(cn$8());
        config.viewProps.bindClassModifiers(this.element);
        const swatchElem = doc.createElement('div');
        swatchElem.classList.add(cn$8('sw'));
        this.element.appendChild(swatchElem);
        this.swatchElem_ = swatchElem;
        const buttonElem = doc.createElement('button');
        buttonElem.classList.add(cn$8('b'));
        config.viewProps.bindDisabled(buttonElem);
        this.element.appendChild(buttonElem);
        this.buttonElement = buttonElem;
        this.update_();
    }
    update_() {
        const value = this.value.rawValue;
        this.swatchElem_.style.backgroundColor = colorToHexRgbaString(value);
    }
    onValueChange_() {
        this.update_();
    }
}

class ColorSwatchController {
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new ColorSwatchView(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
    }
}

class ColorController$1 {
    constructor(doc, config) {
        this.onButtonBlur_ = this.onButtonBlur_.bind(this);
        this.onButtonClick_ = this.onButtonClick_.bind(this);
        this.onPopupChildBlur_ = this.onPopupChildBlur_.bind(this);
        this.onPopupChildKeydown_ = this.onPopupChildKeydown_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.foldable_ = Foldable.create(config.expanded);
        this.swatchC_ = new ColorSwatchController(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        const buttonElem = this.swatchC_.view.buttonElement;
        buttonElem.addEventListener('blur', this.onButtonBlur_);
        buttonElem.addEventListener('click', this.onButtonClick_);
        this.textC_ = new TextController(doc, {
            parser: config.parser,
            props: ValueMap.fromObject({
                formatter: config.formatter,
            }),
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view = new ColorView$1(doc, {
            foldable: this.foldable_,
            pickerLayout: config.pickerLayout,
        });
        this.view.swatchElement.appendChild(this.swatchC_.view.element);
        this.view.textElement.appendChild(this.textC_.view.element);
        this.popC_ =
            config.pickerLayout === 'popup'
                ? new PopupController(doc, {
                    viewProps: this.viewProps,
                })
                : null;
        const pickerC = new ColorPickerController(doc, {
            colorType: config.colorType,
            supportsAlpha: config.supportsAlpha,
            value: this.value,
            viewProps: this.viewProps,
        });
        pickerC.view.allFocusableElements.forEach((elem) => {
            elem.addEventListener('blur', this.onPopupChildBlur_);
            elem.addEventListener('keydown', this.onPopupChildKeydown_);
        });
        this.pickerC_ = pickerC;
        if (this.popC_) {
            this.view.element.appendChild(this.popC_.view.element);
            this.popC_.view.element.appendChild(pickerC.view.element);
            connectValues({
                primary: this.foldable_.value('expanded'),
                secondary: this.popC_.shows,
                forward: (p) => p,
                backward: (_, s) => s,
            });
        }
        else if (this.view.pickerElement) {
            this.view.pickerElement.appendChild(this.pickerC_.view.element);
            bindFoldable(this.foldable_, this.view.pickerElement);
        }
    }
    get textController() {
        return this.textC_;
    }
    onButtonBlur_(e) {
        if (!this.popC_) {
            return;
        }
        const elem = this.view.element;
        const nextTarget = forceCast(e.relatedTarget);
        if (!nextTarget || !elem.contains(nextTarget)) {
            this.popC_.shows.rawValue = false;
        }
    }
    onButtonClick_() {
        this.foldable_.set('expanded', !this.foldable_.get('expanded'));
        if (this.foldable_.get('expanded')) {
            this.pickerC_.view.allFocusableElements[0].focus();
        }
    }
    onPopupChildBlur_(ev) {
        if (!this.popC_) {
            return;
        }
        const elem = this.popC_.view.element;
        const nextTarget = findNextTarget(ev);
        if (nextTarget && elem.contains(nextTarget)) {
            return;
        }
        if (nextTarget &&
            nextTarget === this.swatchC_.view.buttonElement &&
            !supportsTouch(elem.ownerDocument)) {
            return;
        }
        this.popC_.shows.rawValue = false;
    }
    onPopupChildKeydown_(ev) {
        if (this.popC_) {
            if (ev.key === 'Escape') {
                this.popC_.shows.rawValue = false;
            }
        }
        else if (this.view.pickerElement) {
            if (ev.key === 'Escape') {
                this.swatchC_.view.buttonElement.focus();
            }
        }
    }
}

function colorToRgbNumber(value) {
    return removeAlphaComponent(value.getComponents('rgb')).reduce((result, comp) => {
        return (result << 8) | (Math.floor(comp) & 0xff);
    }, 0);
}
function colorToRgbaNumber(value) {
    return (value.getComponents('rgb').reduce((result, comp, index) => {
        const hex = Math.floor(index === 3 ? comp * 255 : comp) & 0xff;
        return (result << 8) | hex;
    }, 0) >>> 0);
}
function numberToRgbColor(num) {
    return new IntColor([(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff], 'rgb');
}
function numberToRgbaColor(num) {
    return new IntColor([
        (num >> 24) & 0xff,
        (num >> 16) & 0xff,
        (num >> 8) & 0xff,
        mapRange$1(num & 0xff, 0, 255, 0, 1),
    ], 'rgb');
}
function colorFromRgbNumber(value) {
    if (typeof value !== 'number') {
        return IntColor.black();
    }
    return numberToRgbColor(value);
}
function colorFromRgbaNumber(value) {
    if (typeof value !== 'number') {
        return IntColor.black();
    }
    return numberToRgbaColor(value);
}

function isRgbColorComponent(obj, key) {
    if (typeof obj !== 'object' || isEmpty(obj)) {
        return false;
    }
    return key in obj && typeof obj[key] === 'number';
}
function isRgbColorObject(obj) {
    return (isRgbColorComponent(obj, 'r') &&
        isRgbColorComponent(obj, 'g') &&
        isRgbColorComponent(obj, 'b'));
}
function isRgbaColorObject(obj) {
    return isRgbColorObject(obj) && isRgbColorComponent(obj, 'a');
}
function isColorObject(obj) {
    return isRgbColorObject(obj);
}
function equalsColor(v1, v2) {
    if (v1.mode !== v2.mode) {
        return false;
    }
    if (v1.type !== v2.type) {
        return false;
    }
    const comps1 = v1.getComponents();
    const comps2 = v2.getComponents();
    for (let i = 0; i < comps1.length; i++) {
        if (comps1[i] !== comps2[i]) {
            return false;
        }
    }
    return true;
}
function createColorComponentsFromRgbObject(obj) {
    return 'a' in obj ? [obj.r, obj.g, obj.b, obj.a] : [obj.r, obj.g, obj.b];
}

function createColorStringWriter(format) {
    const stringify = findColorStringifier(format);
    return stringify
        ? (target, value) => {
            writePrimitive(target, stringify(value));
        }
        : null;
}
function createColorNumberWriter(supportsAlpha) {
    const colorToNumber = supportsAlpha ? colorToRgbaNumber : colorToRgbNumber;
    return (target, value) => {
        writePrimitive(target, colorToNumber(value));
    };
}
function writeRgbaColorObject(target, value, type) {
    const cc = mapColorType(value, type);
    const obj = cc.toRgbaObject();
    target.writeProperty('r', obj.r);
    target.writeProperty('g', obj.g);
    target.writeProperty('b', obj.b);
    target.writeProperty('a', obj.a);
}
function writeRgbColorObject(target, value, type) {
    const cc = mapColorType(value, type);
    const obj = cc.toRgbaObject();
    target.writeProperty('r', obj.r);
    target.writeProperty('g', obj.g);
    target.writeProperty('b', obj.b);
}
function createColorObjectWriter(supportsAlpha, type) {
    return (target, inValue) => {
        if (supportsAlpha) {
            writeRgbaColorObject(target, inValue, type);
        }
        else {
            writeRgbColorObject(target, inValue, type);
        }
    };
}

function shouldSupportAlpha$1(inputParams) {
    var _a;
    if ((_a = inputParams === null || inputParams === void 0 ? void 0 : inputParams.color) === null || _a === void 0 ? void 0 : _a.alpha) {
        return true;
    }
    return false;
}
function createFormatter$1(supportsAlpha) {
    return supportsAlpha
        ? (v) => colorToHexRgbaString(v, '0x')
        : (v) => colorToHexRgbString(v, '0x');
}
function isForColor(params) {
    if ('color' in params) {
        return true;
    }
    if (params.view === 'color') {
        return true;
    }
    return false;
}
createPlugin({
    id: 'input-color-number',
    type: 'input',
    accept: (value, params) => {
        if (typeof value !== 'number') {
            return null;
        }
        if (!isForColor(params)) {
            return null;
        }
        const result = parseColorInputParams(params);
        return result
            ? {
                initialValue: value,
                params: Object.assign(Object.assign({}, result), { supportsAlpha: shouldSupportAlpha$1(params) }),
            }
            : null;
    },
    binding: {
        reader: (args) => {
            return args.params.supportsAlpha
                ? colorFromRgbaNumber
                : colorFromRgbNumber;
        },
        equals: equalsColor,
        writer: (args) => {
            return createColorNumberWriter(args.params.supportsAlpha);
        },
    },
    controller: (args) => {
        var _a, _b;
        return new ColorController$1(args.document, {
            colorType: 'int',
            expanded: (_a = args.params.expanded) !== null && _a !== void 0 ? _a : false,
            formatter: createFormatter$1(args.params.supportsAlpha),
            parser: createColorStringParser('int'),
            pickerLayout: (_b = args.params.picker) !== null && _b !== void 0 ? _b : 'popup',
            supportsAlpha: args.params.supportsAlpha,
            value: args.value,
            viewProps: args.viewProps,
        });
    },
});

function colorFromObject(value, type) {
    if (!isColorObject(value)) {
        return mapColorType(IntColor.black(), type);
    }
    if (type === 'int') {
        const comps = createColorComponentsFromRgbObject(value);
        return new IntColor(comps, 'rgb');
    }
    if (type === 'float') {
        const comps = createColorComponentsFromRgbObject(value);
        return new FloatColor(comps, 'rgb');
    }
    return mapColorType(IntColor.black(), 'int');
}

function shouldSupportAlpha(initialValue) {
    return isRgbaColorObject(initialValue);
}
function createColorObjectBindingReader(type) {
    return (value) => {
        const c = colorFromObject(value, type);
        return mapColorType(c, 'int');
    };
}
function createColorObjectFormatter(supportsAlpha, type) {
    return (value) => {
        if (supportsAlpha) {
            return colorToObjectRgbaString(value, type);
        }
        return colorToObjectRgbString(value, type);
    };
}
createPlugin({
    id: 'input-color-object',
    type: 'input',
    accept: (value, params) => {
        var _a;
        if (!isColorObject(value)) {
            return null;
        }
        const result = parseColorInputParams(params);
        return result
            ? {
                initialValue: value,
                params: Object.assign(Object.assign({}, result), { colorType: (_a = extractColorType(params)) !== null && _a !== void 0 ? _a : 'int' }),
            }
            : null;
    },
    binding: {
        reader: (args) => createColorObjectBindingReader(args.params.colorType),
        equals: equalsColor,
        writer: (args) => createColorObjectWriter(shouldSupportAlpha(args.initialValue), args.params.colorType),
    },
    controller: (args) => {
        var _a, _b;
        const supportsAlpha = isRgbaColorObject(args.initialValue);
        return new ColorController$1(args.document, {
            colorType: args.params.colorType,
            expanded: (_a = args.params.expanded) !== null && _a !== void 0 ? _a : false,
            formatter: createColorObjectFormatter(supportsAlpha, args.params.colorType),
            parser: createColorStringParser('int'),
            pickerLayout: (_b = args.params.picker) !== null && _b !== void 0 ? _b : 'popup',
            supportsAlpha: supportsAlpha,
            value: args.value,
            viewProps: args.viewProps,
        });
    },
});

createPlugin({
    id: 'input-color-string',
    type: 'input',
    accept: (value, params) => {
        if (typeof value !== 'string') {
            return null;
        }
        if (params.view === 'text') {
            return null;
        }
        const format = detectStringColorFormat(value, extractColorType(params));
        if (!format) {
            return null;
        }
        const stringifier = findColorStringifier(format);
        if (!stringifier) {
            return null;
        }
        const result = parseColorInputParams(params);
        return result
            ? {
                initialValue: value,
                params: Object.assign(Object.assign({}, result), { format: format, stringifier: stringifier }),
            }
            : null;
    },
    binding: {
        reader: () => readIntColorString,
        equals: equalsColor,
        writer: (args) => {
            const writer = createColorStringWriter(args.params.format);
            if (!writer) {
                throw TpError.notBindable();
            }
            return writer;
        },
    },
    controller: (args) => {
        var _a, _b;
        return new ColorController$1(args.document, {
            colorType: args.params.format.type,
            expanded: (_a = args.params.expanded) !== null && _a !== void 0 ? _a : false,
            formatter: args.params.stringifier,
            parser: createColorStringParser('int'),
            pickerLayout: (_b = args.params.picker) !== null && _b !== void 0 ? _b : 'popup',
            supportsAlpha: args.params.format.alpha,
            value: args.value,
            viewProps: args.viewProps,
        });
    },
});

class PointNdConstraint {
    constructor(config) {
        this.components = config.components;
        this.asm_ = config.assembly;
    }
    constrain(value) {
        const comps = this.asm_
            .toComponents(value)
            .map((comp, index) => { var _a, _b; return (_b = (_a = this.components[index]) === null || _a === void 0 ? void 0 : _a.constrain(comp)) !== null && _b !== void 0 ? _b : comp; });
        return this.asm_.fromComponents(comps);
    }
}

const cn$7 = ClassName('pndtxt');
class PointNdTextView {
    constructor(doc, config) {
        this.textViews = config.textViews;
        this.element = doc.createElement('div');
        this.element.classList.add(cn$7());
        this.textViews.forEach((v) => {
            const axisElem = doc.createElement('div');
            axisElem.classList.add(cn$7('a'));
            axisElem.appendChild(v.element);
            this.element.appendChild(axisElem);
        });
    }
}

function createAxisController(doc, config, index) {
    return new NumberTextController(doc, {
        arrayPosition: index === 0 ? 'fst' : index === config.axes.length - 1 ? 'lst' : 'mid',
        parser: config.parser,
        props: config.axes[index].textProps,
        value: createValue(0, {
            constraint: config.axes[index].constraint,
        }),
        viewProps: config.viewProps,
    });
}
class PointNdTextController {
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.acs_ = config.axes.map((_, index) => createAxisController(doc, config, index));
        this.acs_.forEach((c, index) => {
            connectValues({
                primary: this.value,
                secondary: c.value,
                forward: (p) => config.assembly.toComponents(p)[index],
                backward: (p, s) => {
                    const comps = config.assembly.toComponents(p);
                    comps[index] = s;
                    return config.assembly.fromComponents(comps);
                },
            });
        });
        this.view = new PointNdTextView(doc, {
            textViews: this.acs_.map((ac) => ac.view),
        });
    }
    get textControllers() {
        return this.acs_;
    }
}

class SliderInputBindingApi extends BindingApi {
    get max() {
        return this.controller.valueController.sliderController.props.get('max');
    }
    set max(max) {
        this.controller.valueController.sliderController.props.set('max', max);
    }
    get min() {
        return this.controller.valueController.sliderController.props.get('min');
    }
    set min(max) {
        this.controller.valueController.sliderController.props.set('min', max);
    }
}

function createConstraint$4(params, initialValue) {
    const constraints = [];
    const sc = createStepConstraint(params, initialValue);
    if (sc) {
        constraints.push(sc);
    }
    const rc = createRangeConstraint(params);
    if (rc) {
        constraints.push(rc);
    }
    const lc = createListConstraint(params.options);
    if (lc) {
        constraints.push(lc);
    }
    return new CompositeConstraint(constraints);
}
createPlugin({
    id: 'input-number',
    type: 'input',
    accept: (value, params) => {
        if (typeof value !== 'number') {
            return null;
        }
        const result = parseRecord(params, (p) => (Object.assign(Object.assign({}, createNumberTextInputParamsParser(p)), { options: p.optional.custom(parseListOptions), readonly: p.optional.constant(false) })));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => numberFromUnknown,
        constraint: (args) => createConstraint$4(args.params, args.initialValue),
        writer: (_args) => writePrimitive,
    },
    controller: (args) => {
        const value = args.value;
        const c = args.constraint;
        const lc = c && findConstraint(c, ListConstraint);
        if (lc) {
            return new ListController(args.document, {
                props: new ValueMap({
                    options: lc.values.value('options'),
                }),
                value: value,
                viewProps: args.viewProps,
            });
        }
        const textPropsObj = createNumberTextPropsObject(args.params, value.rawValue);
        const drc = c && findConstraint(c, DefiniteRangeConstraint);
        if (drc) {
            return new SliderTextController(args.document, Object.assign(Object.assign({}, createSliderTextProps(Object.assign(Object.assign({}, textPropsObj), { keyScale: createValue(textPropsObj.keyScale), max: drc.values.value('max'), min: drc.values.value('min') }))), { parser: parseNumber, value: value, viewProps: args.viewProps }));
        }
        return new NumberTextController(args.document, {
            parser: parseNumber,
            props: ValueMap.fromObject(textPropsObj),
            value: value,
            viewProps: args.viewProps,
        });
    },
    api(args) {
        if (typeof args.controller.value.rawValue !== 'number') {
            return null;
        }
        if (args.controller.valueController instanceof SliderTextController) {
            return new SliderInputBindingApi(args.controller);
        }
        if (args.controller.valueController instanceof ListController) {
            return new ListInputBindingApi(args.controller);
        }
        return null;
    },
});

class Point2d {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    getComponents() {
        return [this.x, this.y];
    }
    static isObject(obj) {
        if (isEmpty(obj)) {
            return false;
        }
        const x = obj.x;
        const y = obj.y;
        if (typeof x !== 'number' || typeof y !== 'number') {
            return false;
        }
        return true;
    }
    static equals(v1, v2) {
        return v1.x === v2.x && v1.y === v2.y;
    }
    toObject() {
        return {
            x: this.x,
            y: this.y,
        };
    }
}
const Point2dAssembly = {
    toComponents: (p) => p.getComponents(),
    fromComponents: (comps) => new Point2d(...comps),
};

const cn$6 = ClassName('p2d');
class Point2dView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$6());
        config.viewProps.bindClassModifiers(this.element);
        bindValue(config.expanded, valueToClassName(this.element, cn$6(undefined, 'expanded')));
        const headElem = doc.createElement('div');
        headElem.classList.add(cn$6('h'));
        this.element.appendChild(headElem);
        const buttonElem = doc.createElement('button');
        buttonElem.classList.add(cn$6('b'));
        buttonElem.appendChild(createSvgIconElement(doc, 'p2dpad'));
        config.viewProps.bindDisabled(buttonElem);
        headElem.appendChild(buttonElem);
        this.buttonElement = buttonElem;
        const textElem = doc.createElement('div');
        textElem.classList.add(cn$6('t'));
        headElem.appendChild(textElem);
        this.textElement = textElem;
        if (config.pickerLayout === 'inline') {
            const pickerElem = doc.createElement('div');
            pickerElem.classList.add(cn$6('p'));
            this.element.appendChild(pickerElem);
            this.pickerElement = pickerElem;
        }
        else {
            this.pickerElement = null;
        }
    }
}

const cn$5 = ClassName('p2dp');
class Point2dPickerView {
    constructor(doc, config) {
        this.onFoldableChange_ = this.onFoldableChange_.bind(this);
        this.onPropsChange_ = this.onPropsChange_.bind(this);
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.props_ = config.props;
        this.props_.emitter.on('change', this.onPropsChange_);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$5());
        if (config.layout === 'popup') {
            this.element.classList.add(cn$5(undefined, 'p'));
        }
        config.viewProps.bindClassModifiers(this.element);
        const padElem = doc.createElement('div');
        padElem.classList.add(cn$5('p'));
        config.viewProps.bindTabIndex(padElem);
        this.element.appendChild(padElem);
        this.padElement = padElem;
        const svgElem = doc.createElementNS(SVG_NS, 'svg');
        svgElem.classList.add(cn$5('g'));
        this.padElement.appendChild(svgElem);
        this.svgElem_ = svgElem;
        const xAxisElem = doc.createElementNS(SVG_NS, 'line');
        xAxisElem.classList.add(cn$5('ax'));
        xAxisElem.setAttributeNS(null, 'x1', '0');
        xAxisElem.setAttributeNS(null, 'y1', '50%');
        xAxisElem.setAttributeNS(null, 'x2', '100%');
        xAxisElem.setAttributeNS(null, 'y2', '50%');
        this.svgElem_.appendChild(xAxisElem);
        const yAxisElem = doc.createElementNS(SVG_NS, 'line');
        yAxisElem.classList.add(cn$5('ax'));
        yAxisElem.setAttributeNS(null, 'x1', '50%');
        yAxisElem.setAttributeNS(null, 'y1', '0');
        yAxisElem.setAttributeNS(null, 'x2', '50%');
        yAxisElem.setAttributeNS(null, 'y2', '100%');
        this.svgElem_.appendChild(yAxisElem);
        const lineElem = doc.createElementNS(SVG_NS, 'line');
        lineElem.classList.add(cn$5('l'));
        lineElem.setAttributeNS(null, 'x1', '50%');
        lineElem.setAttributeNS(null, 'y1', '50%');
        this.svgElem_.appendChild(lineElem);
        this.lineElem_ = lineElem;
        const markerElem = doc.createElement('div');
        markerElem.classList.add(cn$5('m'));
        this.padElement.appendChild(markerElem);
        this.markerElem_ = markerElem;
        config.value.emitter.on('change', this.onValueChange_);
        this.value = config.value;
        this.update_();
    }
    get allFocusableElements() {
        return [this.padElement];
    }
    update_() {
        const [x, y] = this.value.rawValue.getComponents();
        const max = this.props_.get('max');
        const px = mapRange$1(x, -max, +max, 0, 100);
        const py = mapRange$1(y, -max, +max, 0, 100);
        const ipy = this.props_.get('invertsY') ? 100 - py : py;
        this.lineElem_.setAttributeNS(null, 'x2', `${px}%`);
        this.lineElem_.setAttributeNS(null, 'y2', `${ipy}%`);
        this.markerElem_.style.left = `${px}%`;
        this.markerElem_.style.top = `${ipy}%`;
    }
    onValueChange_() {
        this.update_();
    }
    onPropsChange_() {
        this.update_();
    }
    onFoldableChange_() {
        this.update_();
    }
}

function computeOffset(ev, keyScales, invertsY) {
    return [
        getStepForKey(keyScales[0], getHorizontalStepKeys(ev)),
        getStepForKey(keyScales[1], getVerticalStepKeys(ev)) * (invertsY ? 1 : -1),
    ];
}
class Point2dPickerController {
    constructor(doc, config) {
        this.onPadKeyDown_ = this.onPadKeyDown_.bind(this);
        this.onPadKeyUp_ = this.onPadKeyUp_.bind(this);
        this.onPointerDown_ = this.onPointerDown_.bind(this);
        this.onPointerMove_ = this.onPointerMove_.bind(this);
        this.onPointerUp_ = this.onPointerUp_.bind(this);
        this.props = config.props;
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new Point2dPickerView(doc, {
            layout: config.layout,
            props: this.props,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.ptHandler_ = new PointerHandler(this.view.padElement);
        this.ptHandler_.emitter.on('down', this.onPointerDown_);
        this.ptHandler_.emitter.on('move', this.onPointerMove_);
        this.ptHandler_.emitter.on('up', this.onPointerUp_);
        this.view.padElement.addEventListener('keydown', this.onPadKeyDown_);
        this.view.padElement.addEventListener('keyup', this.onPadKeyUp_);
    }
    handlePointerEvent_(d, opts) {
        if (!d.point) {
            return;
        }
        const max = this.props.get('max');
        const px = mapRange$1(d.point.x, 0, d.bounds.width, -max, +max);
        const py = mapRange$1(this.props.get('invertsY') ? d.bounds.height - d.point.y : d.point.y, 0, d.bounds.height, -max, +max);
        this.value.setRawValue(new Point2d(px, py), opts);
    }
    onPointerDown_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerMove_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerUp_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: true,
            last: true,
        });
    }
    onPadKeyDown_(ev) {
        if (isArrowKey(ev.key)) {
            ev.preventDefault();
        }
        const [dx, dy] = computeOffset(ev, [this.props.get('xKeyScale'), this.props.get('yKeyScale')], this.props.get('invertsY'));
        if (dx === 0 && dy === 0) {
            return;
        }
        this.value.setRawValue(new Point2d(this.value.rawValue.x + dx, this.value.rawValue.y + dy), {
            forceEmit: false,
            last: false,
        });
    }
    onPadKeyUp_(ev) {
        const [dx, dy] = computeOffset(ev, [this.props.get('xKeyScale'), this.props.get('yKeyScale')], this.props.get('invertsY'));
        if (dx === 0 && dy === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue, {
            forceEmit: true,
            last: true,
        });
    }
}

class Point2dController {
    constructor(doc, config) {
        var _a, _b;
        this.onPopupChildBlur_ = this.onPopupChildBlur_.bind(this);
        this.onPopupChildKeydown_ = this.onPopupChildKeydown_.bind(this);
        this.onPadButtonBlur_ = this.onPadButtonBlur_.bind(this);
        this.onPadButtonClick_ = this.onPadButtonClick_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.foldable_ = Foldable.create(config.expanded);
        this.popC_ =
            config.pickerLayout === 'popup'
                ? new PopupController(doc, {
                    viewProps: this.viewProps,
                })
                : null;
        const padC = new Point2dPickerController(doc, {
            layout: config.pickerLayout,
            props: new ValueMap({
                invertsY: createValue(config.invertsY),
                max: createValue(config.max),
                xKeyScale: config.axes[0].textProps.value('keyScale'),
                yKeyScale: config.axes[1].textProps.value('keyScale'),
            }),
            value: this.value,
            viewProps: this.viewProps,
        });
        padC.view.allFocusableElements.forEach((elem) => {
            elem.addEventListener('blur', this.onPopupChildBlur_);
            elem.addEventListener('keydown', this.onPopupChildKeydown_);
        });
        this.pickerC_ = padC;
        this.textC_ = new PointNdTextController(doc, {
            assembly: Point2dAssembly,
            axes: config.axes,
            parser: config.parser,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view = new Point2dView(doc, {
            expanded: this.foldable_.value('expanded'),
            pickerLayout: config.pickerLayout,
            viewProps: this.viewProps,
        });
        this.view.textElement.appendChild(this.textC_.view.element);
        (_a = this.view.buttonElement) === null || _a === void 0 ? void 0 : _a.addEventListener('blur', this.onPadButtonBlur_);
        (_b = this.view.buttonElement) === null || _b === void 0 ? void 0 : _b.addEventListener('click', this.onPadButtonClick_);
        if (this.popC_) {
            this.view.element.appendChild(this.popC_.view.element);
            this.popC_.view.element.appendChild(this.pickerC_.view.element);
            connectValues({
                primary: this.foldable_.value('expanded'),
                secondary: this.popC_.shows,
                forward: (p) => p,
                backward: (_, s) => s,
            });
        }
        else if (this.view.pickerElement) {
            this.view.pickerElement.appendChild(this.pickerC_.view.element);
            bindFoldable(this.foldable_, this.view.pickerElement);
        }
    }
    get textController() {
        return this.textC_;
    }
    onPadButtonBlur_(e) {
        if (!this.popC_) {
            return;
        }
        const elem = this.view.element;
        const nextTarget = forceCast(e.relatedTarget);
        if (!nextTarget || !elem.contains(nextTarget)) {
            this.popC_.shows.rawValue = false;
        }
    }
    onPadButtonClick_() {
        this.foldable_.set('expanded', !this.foldable_.get('expanded'));
        if (this.foldable_.get('expanded')) {
            this.pickerC_.view.allFocusableElements[0].focus();
        }
    }
    onPopupChildBlur_(ev) {
        if (!this.popC_) {
            return;
        }
        const elem = this.popC_.view.element;
        const nextTarget = findNextTarget(ev);
        if (nextTarget && elem.contains(nextTarget)) {
            return;
        }
        if (nextTarget &&
            nextTarget === this.view.buttonElement &&
            !supportsTouch(elem.ownerDocument)) {
            return;
        }
        this.popC_.shows.rawValue = false;
    }
    onPopupChildKeydown_(ev) {
        if (this.popC_) {
            if (ev.key === 'Escape') {
                this.popC_.shows.rawValue = false;
            }
        }
        else if (this.view.pickerElement) {
            if (ev.key === 'Escape') {
                this.view.buttonElement.focus();
            }
        }
    }
}

function point2dFromUnknown(value) {
    return Point2d.isObject(value)
        ? new Point2d(value.x, value.y)
        : new Point2d();
}
function writePoint2d(target, value) {
    target.writeProperty('x', value.x);
    target.writeProperty('y', value.y);
}

function createConstraint$3(params, initialValue) {
    return new PointNdConstraint({
        assembly: Point2dAssembly,
        components: [
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.x), initialValue.x),
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.y), initialValue.y),
        ],
    });
}
function getSuitableMaxDimensionValue(params, rawValue) {
    var _a, _b;
    if (!isEmpty(params.min) || !isEmpty(params.max)) {
        return Math.max(Math.abs((_a = params.min) !== null && _a !== void 0 ? _a : 0), Math.abs((_b = params.max) !== null && _b !== void 0 ? _b : 0));
    }
    const step = getSuitableKeyScale(params);
    return Math.max(Math.abs(step) * 10, Math.abs(rawValue) * 10);
}
function getSuitableMax(params, initialValue) {
    var _a, _b;
    const xr = getSuitableMaxDimensionValue(deepMerge(params, ((_a = params.x) !== null && _a !== void 0 ? _a : {})), initialValue.x);
    const yr = getSuitableMaxDimensionValue(deepMerge(params, ((_b = params.y) !== null && _b !== void 0 ? _b : {})), initialValue.y);
    return Math.max(xr, yr);
}
function shouldInvertY(params) {
    if (!('y' in params)) {
        return false;
    }
    const yParams = params.y;
    if (!yParams) {
        return false;
    }
    return 'inverted' in yParams ? !!yParams.inverted : false;
}
createPlugin({
    id: 'input-point2d',
    type: 'input',
    accept: (value, params) => {
        if (!Point2d.isObject(value)) {
            return null;
        }
        const result = parseRecord(params, (p) => (Object.assign(Object.assign({}, createPointDimensionParser(p)), { expanded: p.optional.boolean, picker: p.optional.custom(parsePickerLayout), readonly: p.optional.constant(false), x: p.optional.custom(parsePointDimensionParams), y: p.optional.object(Object.assign(Object.assign({}, createPointDimensionParser(p)), { inverted: p.optional.boolean })) })));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: () => point2dFromUnknown,
        constraint: (args) => createConstraint$3(args.params, args.initialValue),
        equals: Point2d.equals,
        writer: () => writePoint2d,
    },
    controller: (args) => {
        var _a, _b;
        const doc = args.document;
        const value = args.value;
        const c = args.constraint;
        const dParams = [args.params.x, args.params.y];
        return new Point2dController(doc, {
            axes: value.rawValue.getComponents().map((comp, i) => {
                var _a;
                return createPointAxis({
                    constraint: c.components[i],
                    initialValue: comp,
                    params: deepMerge(args.params, ((_a = dParams[i]) !== null && _a !== void 0 ? _a : {})),
                });
            }),
            expanded: (_a = args.params.expanded) !== null && _a !== void 0 ? _a : false,
            invertsY: shouldInvertY(args.params),
            max: getSuitableMax(args.params, value.rawValue),
            parser: parseNumber,
            pickerLayout: (_b = args.params.picker) !== null && _b !== void 0 ? _b : 'popup',
            value: value,
            viewProps: args.viewProps,
        });
    },
});

class Point3d {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    getComponents() {
        return [this.x, this.y, this.z];
    }
    static isObject(obj) {
        if (isEmpty(obj)) {
            return false;
        }
        const x = obj.x;
        const y = obj.y;
        const z = obj.z;
        if (typeof x !== 'number' ||
            typeof y !== 'number' ||
            typeof z !== 'number') {
            return false;
        }
        return true;
    }
    static equals(v1, v2) {
        return v1.x === v2.x && v1.y === v2.y && v1.z === v2.z;
    }
    toObject() {
        return {
            x: this.x,
            y: this.y,
            z: this.z,
        };
    }
}
const Point3dAssembly = {
    toComponents: (p) => p.getComponents(),
    fromComponents: (comps) => new Point3d(...comps),
};

function point3dFromUnknown(value) {
    return Point3d.isObject(value)
        ? new Point3d(value.x, value.y, value.z)
        : new Point3d();
}
function writePoint3d(target, value) {
    target.writeProperty('x', value.x);
    target.writeProperty('y', value.y);
    target.writeProperty('z', value.z);
}

function createConstraint$2(params, initialValue) {
    return new PointNdConstraint({
        assembly: Point3dAssembly,
        components: [
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.x), initialValue.x),
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.y), initialValue.y),
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.z), initialValue.z),
        ],
    });
}
createPlugin({
    id: 'input-point3d',
    type: 'input',
    accept: (value, params) => {
        if (!Point3d.isObject(value)) {
            return null;
        }
        const result = parseRecord(params, (p) => (Object.assign(Object.assign({}, createPointDimensionParser(p)), { readonly: p.optional.constant(false), x: p.optional.custom(parsePointDimensionParams), y: p.optional.custom(parsePointDimensionParams), z: p.optional.custom(parsePointDimensionParams) })));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => point3dFromUnknown,
        constraint: (args) => createConstraint$2(args.params, args.initialValue),
        equals: Point3d.equals,
        writer: (_args) => writePoint3d,
    },
    controller: (args) => {
        const value = args.value;
        const c = args.constraint;
        const dParams = [args.params.x, args.params.y, args.params.z];
        return new PointNdTextController(args.document, {
            assembly: Point3dAssembly,
            axes: value.rawValue.getComponents().map((comp, i) => {
                var _a;
                return createPointAxis({
                    constraint: c.components[i],
                    initialValue: comp,
                    params: deepMerge(args.params, ((_a = dParams[i]) !== null && _a !== void 0 ? _a : {})),
                });
            }),
            parser: parseNumber,
            value: value,
            viewProps: args.viewProps,
        });
    },
});

class Point4d {
    constructor(x = 0, y = 0, z = 0, w = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }
    getComponents() {
        return [this.x, this.y, this.z, this.w];
    }
    static isObject(obj) {
        if (isEmpty(obj)) {
            return false;
        }
        const x = obj.x;
        const y = obj.y;
        const z = obj.z;
        const w = obj.w;
        if (typeof x !== 'number' ||
            typeof y !== 'number' ||
            typeof z !== 'number' ||
            typeof w !== 'number') {
            return false;
        }
        return true;
    }
    static equals(v1, v2) {
        return v1.x === v2.x && v1.y === v2.y && v1.z === v2.z && v1.w === v2.w;
    }
    toObject() {
        return {
            x: this.x,
            y: this.y,
            z: this.z,
            w: this.w,
        };
    }
}
const Point4dAssembly = {
    toComponents: (p) => p.getComponents(),
    fromComponents: (comps) => new Point4d(...comps),
};

function point4dFromUnknown(value) {
    return Point4d.isObject(value)
        ? new Point4d(value.x, value.y, value.z, value.w)
        : new Point4d();
}
function writePoint4d(target, value) {
    target.writeProperty('x', value.x);
    target.writeProperty('y', value.y);
    target.writeProperty('z', value.z);
    target.writeProperty('w', value.w);
}

function createConstraint$1(params, initialValue) {
    return new PointNdConstraint({
        assembly: Point4dAssembly,
        components: [
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.x), initialValue.x),
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.y), initialValue.y),
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.z), initialValue.z),
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.w), initialValue.w),
        ],
    });
}
createPlugin({
    id: 'input-point4d',
    type: 'input',
    accept: (value, params) => {
        if (!Point4d.isObject(value)) {
            return null;
        }
        const result = parseRecord(params, (p) => (Object.assign(Object.assign({}, createPointDimensionParser(p)), { readonly: p.optional.constant(false), w: p.optional.custom(parsePointDimensionParams), x: p.optional.custom(parsePointDimensionParams), y: p.optional.custom(parsePointDimensionParams), z: p.optional.custom(parsePointDimensionParams) })));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => point4dFromUnknown,
        constraint: (args) => createConstraint$1(args.params, args.initialValue),
        equals: Point4d.equals,
        writer: (_args) => writePoint4d,
    },
    controller: (args) => {
        const value = args.value;
        const c = args.constraint;
        const dParams = [
            args.params.x,
            args.params.y,
            args.params.z,
            args.params.w,
        ];
        return new PointNdTextController(args.document, {
            assembly: Point4dAssembly,
            axes: value.rawValue.getComponents().map((comp, i) => {
                var _a;
                return createPointAxis({
                    constraint: c.components[i],
                    initialValue: comp,
                    params: deepMerge(args.params, ((_a = dParams[i]) !== null && _a !== void 0 ? _a : {})),
                });
            }),
            parser: parseNumber,
            value: value,
            viewProps: args.viewProps,
        });
    },
});

function createConstraint(params) {
    const constraints = [];
    const lc = createListConstraint(params.options);
    if (lc) {
        constraints.push(lc);
    }
    return new CompositeConstraint(constraints);
}
createPlugin({
    id: 'input-string',
    type: 'input',
    accept: (value, params) => {
        if (typeof value !== 'string') {
            return null;
        }
        const result = parseRecord(params, (p) => ({
            readonly: p.optional.constant(false),
            options: p.optional.custom(parseListOptions),
        }));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => stringFromUnknown,
        constraint: (args) => createConstraint(args.params),
        writer: (_args) => writePrimitive,
    },
    controller: (args) => {
        const doc = args.document;
        const value = args.value;
        const c = args.constraint;
        const lc = c && findConstraint(c, ListConstraint);
        if (lc) {
            return new ListController(doc, {
                props: new ValueMap({
                    options: lc.values.value('options'),
                }),
                value: value,
                viewProps: args.viewProps,
            });
        }
        return new TextController(doc, {
            parser: (v) => v,
            props: ValueMap.fromObject({
                formatter: formatString,
            }),
            value: value,
            viewProps: args.viewProps,
        });
    },
    api(args) {
        if (typeof args.controller.value.rawValue !== 'string') {
            return null;
        }
        if (args.controller.valueController instanceof ListController) {
            return new ListInputBindingApi(args.controller);
        }
        return null;
    },
});

const Constants = {
    monitor: {
        defaultInterval: 200,
        defaultRows: 3,
    },
};

const cn$4 = ClassName('mll');
class MultiLogView {
    constructor(doc, config) {
        this.onValueUpdate_ = this.onValueUpdate_.bind(this);
        this.formatter_ = config.formatter;
        this.element = doc.createElement('div');
        this.element.classList.add(cn$4());
        config.viewProps.bindClassModifiers(this.element);
        const textareaElem = doc.createElement('textarea');
        textareaElem.classList.add(cn$4('i'));
        textareaElem.style.height = `calc(var(${getCssVar('containerUnitSize')}) * ${config.rows})`;
        textareaElem.readOnly = true;
        config.viewProps.bindDisabled(textareaElem);
        this.element.appendChild(textareaElem);
        this.textareaElem_ = textareaElem;
        config.value.emitter.on('change', this.onValueUpdate_);
        this.value = config.value;
        this.update_();
    }
    update_() {
        const elem = this.textareaElem_;
        const shouldScroll = elem.scrollTop === elem.scrollHeight - elem.clientHeight;
        const lines = [];
        this.value.rawValue.forEach((value) => {
            if (value !== undefined) {
                lines.push(this.formatter_(value));
            }
        });
        elem.textContent = lines.join('\n');
        if (shouldScroll) {
            elem.scrollTop = elem.scrollHeight;
        }
    }
    onValueUpdate_() {
        this.update_();
    }
}

class MultiLogController {
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new MultiLogView(doc, {
            formatter: config.formatter,
            rows: config.rows,
            value: this.value,
            viewProps: this.viewProps,
        });
    }
}

const cn$3 = ClassName('sgl');
class SingleLogView {
    constructor(doc, config) {
        this.onValueUpdate_ = this.onValueUpdate_.bind(this);
        this.formatter_ = config.formatter;
        this.element = doc.createElement('div');
        this.element.classList.add(cn$3());
        config.viewProps.bindClassModifiers(this.element);
        const inputElem = doc.createElement('input');
        inputElem.classList.add(cn$3('i'));
        inputElem.readOnly = true;
        inputElem.type = 'text';
        config.viewProps.bindDisabled(inputElem);
        this.element.appendChild(inputElem);
        this.inputElement = inputElem;
        config.value.emitter.on('change', this.onValueUpdate_);
        this.value = config.value;
        this.update_();
    }
    update_() {
        const values = this.value.rawValue;
        const lastValue = values[values.length - 1];
        this.inputElement.value =
            lastValue !== undefined ? this.formatter_(lastValue) : '';
    }
    onValueUpdate_() {
        this.update_();
    }
}

class SingleLogController {
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new SingleLogView(doc, {
            formatter: config.formatter,
            value: this.value,
            viewProps: this.viewProps,
        });
    }
}

createPlugin({
    id: 'monitor-bool',
    type: 'monitor',
    accept: (value, params) => {
        if (typeof value !== 'boolean') {
            return null;
        }
        const result = parseRecord(params, (p) => ({
            readonly: p.required.constant(true),
            rows: p.optional.number,
        }));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => boolFromUnknown,
    },
    controller: (args) => {
        var _a;
        if (args.value.rawValue.length === 1) {
            return new SingleLogController(args.document, {
                formatter: BooleanFormatter,
                value: args.value,
                viewProps: args.viewProps,
            });
        }
        return new MultiLogController(args.document, {
            formatter: BooleanFormatter,
            rows: (_a = args.params.rows) !== null && _a !== void 0 ? _a : Constants.monitor.defaultRows,
            value: args.value,
            viewProps: args.viewProps,
        });
    },
});

class GraphLogMonitorBindingApi extends BindingApi {
    get max() {
        return this.controller.valueController.props.get('max');
    }
    set max(max) {
        this.controller.valueController.props.set('max', max);
    }
    get min() {
        return this.controller.valueController.props.get('min');
    }
    set min(min) {
        this.controller.valueController.props.set('min', min);
    }
}

const cn$2 = ClassName('grl');
class GraphLogView {
    constructor(doc, config) {
        this.onCursorChange_ = this.onCursorChange_.bind(this);
        this.onValueUpdate_ = this.onValueUpdate_.bind(this);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$2());
        config.viewProps.bindClassModifiers(this.element);
        this.formatter_ = config.formatter;
        this.props_ = config.props;
        this.cursor_ = config.cursor;
        this.cursor_.emitter.on('change', this.onCursorChange_);
        const svgElem = doc.createElementNS(SVG_NS, 'svg');
        svgElem.classList.add(cn$2('g'));
        svgElem.style.height = `calc(var(${getCssVar('containerUnitSize')}) * ${config.rows})`;
        this.element.appendChild(svgElem);
        this.svgElem_ = svgElem;
        const lineElem = doc.createElementNS(SVG_NS, 'polyline');
        this.svgElem_.appendChild(lineElem);
        this.lineElem_ = lineElem;
        const tooltipElem = doc.createElement('div');
        tooltipElem.classList.add(cn$2('t'), ClassName('tt')());
        this.element.appendChild(tooltipElem);
        this.tooltipElem_ = tooltipElem;
        config.value.emitter.on('change', this.onValueUpdate_);
        this.value = config.value;
        this.update_();
    }
    get graphElement() {
        return this.svgElem_;
    }
    update_() {
        const { clientWidth: w, clientHeight: h } = this.element;
        const maxIndex = this.value.rawValue.length - 1;
        const min = this.props_.get('min');
        const max = this.props_.get('max');
        const points = [];
        this.value.rawValue.forEach((v, index) => {
            if (v === undefined) {
                return;
            }
            const x = mapRange$1(index, 0, maxIndex, 0, w);
            const y = mapRange$1(v, min, max, h, 0);
            points.push([x, y].join(','));
        });
        this.lineElem_.setAttributeNS(null, 'points', points.join(' '));
        const tooltipElem = this.tooltipElem_;
        const value = this.value.rawValue[this.cursor_.rawValue];
        if (value === undefined) {
            tooltipElem.classList.remove(cn$2('t', 'a'));
            return;
        }
        const tx = mapRange$1(this.cursor_.rawValue, 0, maxIndex, 0, w);
        const ty = mapRange$1(value, min, max, h, 0);
        tooltipElem.style.left = `${tx}px`;
        tooltipElem.style.top = `${ty}px`;
        tooltipElem.textContent = `${this.formatter_(value)}`;
        if (!tooltipElem.classList.contains(cn$2('t', 'a'))) {
            tooltipElem.classList.add(cn$2('t', 'a'), cn$2('t', 'in'));
            forceReflow(tooltipElem);
            tooltipElem.classList.remove(cn$2('t', 'in'));
        }
    }
    onValueUpdate_() {
        this.update_();
    }
    onCursorChange_() {
        this.update_();
    }
}

class GraphLogController {
    constructor(doc, config) {
        this.onGraphMouseMove_ = this.onGraphMouseMove_.bind(this);
        this.onGraphMouseLeave_ = this.onGraphMouseLeave_.bind(this);
        this.onGraphPointerDown_ = this.onGraphPointerDown_.bind(this);
        this.onGraphPointerMove_ = this.onGraphPointerMove_.bind(this);
        this.onGraphPointerUp_ = this.onGraphPointerUp_.bind(this);
        this.props = config.props;
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.cursor_ = createValue(-1);
        this.view = new GraphLogView(doc, {
            cursor: this.cursor_,
            formatter: config.formatter,
            rows: config.rows,
            props: this.props,
            value: this.value,
            viewProps: this.viewProps,
        });
        if (!supportsTouch(doc)) {
            this.view.element.addEventListener('mousemove', this.onGraphMouseMove_);
            this.view.element.addEventListener('mouseleave', this.onGraphMouseLeave_);
        }
        else {
            const ph = new PointerHandler(this.view.element);
            ph.emitter.on('down', this.onGraphPointerDown_);
            ph.emitter.on('move', this.onGraphPointerMove_);
            ph.emitter.on('up', this.onGraphPointerUp_);
        }
    }
    importProps(state) {
        return importBladeState(state, null, (p) => ({
            max: p.required.number,
            min: p.required.number,
        }), (result) => {
            this.props.set('max', result.max);
            this.props.set('min', result.min);
            return true;
        });
    }
    exportProps() {
        return exportBladeState(null, {
            max: this.props.get('max'),
            min: this.props.get('min'),
        });
    }
    onGraphMouseLeave_() {
        this.cursor_.rawValue = -1;
    }
    onGraphMouseMove_(ev) {
        const { clientWidth: w } = this.view.element;
        this.cursor_.rawValue = Math.floor(mapRange$1(ev.offsetX, 0, w, 0, this.value.rawValue.length));
    }
    onGraphPointerDown_(ev) {
        this.onGraphPointerMove_(ev);
    }
    onGraphPointerMove_(ev) {
        if (!ev.data.point) {
            this.cursor_.rawValue = -1;
            return;
        }
        this.cursor_.rawValue = Math.floor(mapRange$1(ev.data.point.x, 0, ev.data.bounds.width, 0, this.value.rawValue.length));
    }
    onGraphPointerUp_() {
        this.cursor_.rawValue = -1;
    }
}

function createFormatter(params) {
    return !isEmpty(params.format) ? params.format : createNumberFormatter(2);
}
function createTextMonitor(args) {
    var _a;
    if (args.value.rawValue.length === 1) {
        return new SingleLogController(args.document, {
            formatter: createFormatter(args.params),
            value: args.value,
            viewProps: args.viewProps,
        });
    }
    return new MultiLogController(args.document, {
        formatter: createFormatter(args.params),
        rows: (_a = args.params.rows) !== null && _a !== void 0 ? _a : Constants.monitor.defaultRows,
        value: args.value,
        viewProps: args.viewProps,
    });
}
function createGraphMonitor(args) {
    var _a, _b, _c;
    return new GraphLogController(args.document, {
        formatter: createFormatter(args.params),
        rows: (_a = args.params.rows) !== null && _a !== void 0 ? _a : Constants.monitor.defaultRows,
        props: ValueMap.fromObject({
            max: (_b = args.params.max) !== null && _b !== void 0 ? _b : 100,
            min: (_c = args.params.min) !== null && _c !== void 0 ? _c : 0,
        }),
        value: args.value,
        viewProps: args.viewProps,
    });
}
function shouldShowGraph(params) {
    return params.view === 'graph';
}
createPlugin({
    id: 'monitor-number',
    type: 'monitor',
    accept: (value, params) => {
        if (typeof value !== 'number') {
            return null;
        }
        const result = parseRecord(params, (p) => ({
            format: p.optional.function,
            max: p.optional.number,
            min: p.optional.number,
            readonly: p.required.constant(true),
            rows: p.optional.number,
            view: p.optional.string,
        }));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        defaultBufferSize: (params) => (shouldShowGraph(params) ? 64 : 1),
        reader: (_args) => numberFromUnknown,
    },
    controller: (args) => {
        if (shouldShowGraph(args.params)) {
            return createGraphMonitor(args);
        }
        return createTextMonitor(args);
    },
    api: (args) => {
        if (args.controller.valueController instanceof GraphLogController) {
            return new GraphLogMonitorBindingApi(args.controller);
        }
        return null;
    },
});

createPlugin({
    id: 'monitor-string',
    type: 'monitor',
    accept: (value, params) => {
        if (typeof value !== 'string') {
            return null;
        }
        const result = parseRecord(params, (p) => ({
            multiline: p.optional.boolean,
            readonly: p.required.constant(true),
            rows: p.optional.number,
        }));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => stringFromUnknown,
    },
    controller: (args) => {
        var _a;
        const value = args.value;
        const multiline = value.rawValue.length > 1 || args.params.multiline;
        if (multiline) {
            return new MultiLogController(args.document, {
                formatter: formatString,
                rows: (_a = args.params.rows) !== null && _a !== void 0 ? _a : Constants.monitor.defaultRows,
                value: value,
                viewProps: args.viewProps,
            });
        }
        return new SingleLogController(args.document, {
            formatter: formatString,
            value: value,
            viewProps: args.viewProps,
        });
    },
});

function dot3 (a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function multiply_v3_m3x3 (input, matrix, out = [0, 0, 0]) {
	const x = dot3(input, matrix[0]);
	const y = dot3(input, matrix[1]);
	const z = dot3(input, matrix[2]);
	out[0] = x;
	out[1] = y;
	out[2] = z;
	return out;
}

function isString (str) {
	return type(str) === "string";
}
function type (o) {
	let str = Object.prototype.toString.call(o);
	return (str.match(/^\[object\s+(.*?)\]$/)[1] || "").toLowerCase();
}
function serializeNumber (n, { precision = 16, unit }) {
	if (isNone(n)) {
		return "none";
	}
	n = +toPrecision(n, precision);
	return n + (unit ?? "");
}
function isNone (n) {
	return n === null;
}
function toPrecision (n, precision) {
	if (n === 0) {
		return 0;
	}
	let integer = ~~n;
	let digits = 0;
	if (integer && precision) {
		digits = ~~Math.log10(Math.abs(integer)) + 1;
	}
	const multiplier = 10.0 ** (precision - digits);
	return Math.floor(n * multiplier + 0.5) / multiplier;
}
function interpolate (start, end, p) {
	if (isNaN(start)) {
		return end;
	}
	if (isNaN(end)) {
		return start;
	}
	return start + (end - start) * p;
}
function interpolateInv (start, end, value) {
	return (value - start) / (end - start);
}
function mapRange (from, to, value) {
	if (
		!from ||
		!to ||
		from === to ||
		(from[0] === to[0] && from[1] === to[1]) ||
		isNaN(value) ||
		value === null
	) {
		return value;
	}
	return interpolate(to[0], to[1], interpolateInv(from[0], from[1], value));
}
function clamp$1 (min, val, max) {
	return Math.max(Math.min(max, val), min);
}
function copySign (to, from) {
	return Math.sign(to) === Math.sign(from) ? to : -to;
}
function spow (base, exp) {
	return copySign(Math.abs(base) ** exp, base);
}
function zdiv (n, d) {
	return d === 0 ? 0 : n / d;
}
function bisectLeft (arr, value, lo = 0, hi = arr.length) {
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (arr[mid] < value) {
			lo = mid + 1;
		}
		else {
			hi = mid;
		}
	}
	return lo;
}
function isInstance (arg, constructor) {
	if (arg instanceof constructor) {
		return true;
	}
	const targetName = constructor.name;
	while (arg) {
		const proto = Object.getPrototypeOf(arg);
		const constructorName = proto?.constructor?.name;
		if (constructorName === targetName) {
			return true;
		}
		if (!constructorName || constructorName === "Object") {
			return false;
		}
		arg = proto;
	}
	return false;
}

class Type {
	type;
	coordMeta;
	coordRange;
	range;
	constructor (type, coordMeta) {
		if (typeof type === "object") {
			this.coordMeta = type;
		}
		if (coordMeta) {
			this.coordMeta = coordMeta;
			this.coordRange = coordMeta.range ?? coordMeta.refRange;
		}
		if (typeof type === "string") {
			let params = type
				.trim()
				.match(/^(?<type><[a-z]+>)(\[(?<min>-?[.\d]+),\s*(?<max>-?[.\d]+)\])?$/);
			if (!params) {
				throw new TypeError(`Cannot parse ${type} as a type definition.`);
			}
			this.type = params.groups.type;
			let { min, max } = params.groups;
			if (min || max) {
				this.range = [+min, +max];
			}
		}
	}
	get computedRange () {
		if (this.range) {
			return this.range;
		}
		if (this.type === "<percentage>") {
			return this.percentageRange();
		}
		else if (this.type === "<angle>") {
			return [0, 360];
		}
		return null;
	}
	get unit () {
		if (this.type === "<percentage>") {
			return "%";
		}
		else if (this.type === "<angle>") {
			return "deg";
		}
		return "";
	}
	resolve (number) {
		if (this.type === "<angle>") {
			return number;
		}
		let fromRange = this.computedRange;
		let toRange = this.coordRange;
		if (this.type === "<percentage>") {
			toRange ??= this.percentageRange();
		}
		return mapRange(fromRange, toRange, number);
	}
	serialize (number, precision) {
		let toRange = this.type === "<percentage>" ? this.percentageRange(100) : this.computedRange;
		let unit = this.unit;
		number = mapRange(this.coordRange, toRange, number);
		return serializeNumber(number, { unit, precision });
	}
	toString () {
		let ret = this.type;
		if (this.range) {
			let [min = "", max = ""] = this.range;
			ret += `[${min},${max}]`;
		}
		return ret;
	}
	percentageRange (scale = 1) {
		let range;
		if (
			(this.coordMeta && this.coordMeta.range) ||
			(this.coordRange && this.coordRange[0] >= 0)
		) {
			range = [0, 1];
		}
		else {
			range = [-1, 1];
		}
		return [range[0] * scale, range[1] * scale];
	}
	static get (type, coordMeta) {
		if (isInstance(type, this)) {
			return type;
		}
		return new this(type, coordMeta);
	}
}

const instance = Symbol("instance");
class Format {
	type;
	name;
	spaceCoords;
	coords;
	id;
	alpha;
	constructor (format, space = format.space) {
		format[instance] = this;
		this.type = "function";
		this.name = "color";
		Object.assign(this, format);
		this.space = space;
		if (this.type === "custom") {
			return;
		}
		this.spaceCoords = Object.values(space.coords);
		if (!this.coords) {
			this.coords = this.spaceCoords.map(coordMeta => {
				let ret = ["<number>", "<percentage>"];
				if (coordMeta.type === "angle") {
					ret.push("<angle>");
				}
				return ret;
			});
		}
		this.coords = this.coords.map(
			 (types, i) => {
				let coordMeta = this.spaceCoords[i];
				if (typeof types === "string") {
					types = types.trim().split(/\s*\|\s*/);
				}
				return types.map(type => Type.get(type, coordMeta));
			},
		);
	}
	serializeCoords (coords, precision, types) {
		types = coords.map((_, i) =>
			Type.get(types?.[i] ?? this.coords[i][0], this.spaceCoords[i]));
		return coords.map((c, i) => types[i].serialize(c, precision));
	}
	coerceCoords (coords, types) {
		return Object.entries(this.space.coords).map(([id, coordMeta], i) => {
			let arg = coords[i];
			if (isNone(arg) || isNaN(arg)) {
				return arg;
			}
			let providedType = types[i];
			let type = this.coords[i].find(c => c.type == providedType);
			if (!type) {
				let coordName = coordMeta.name || id;
				throw new TypeError(
					`${providedType ??  (arg)?.raw ?? arg} not allowed for ${coordName} in ${this.name}()`,
				);
			}
			arg = type.resolve(arg);
			if (type.range) {
				types[i] = type.toString();
			}
			return arg;
		});
	}
	canSerialize () {
		return this.type === "function" ||  (this).serialize;
	}
	parse (str) {
		return null;
	}
	static get (format, ...args) {
		if (!format || isInstance(format, this)) {
			return  (format);
		}
		if (format[instance]) {
			return format[instance];
		}
		return new Format(format, ...args);
	}
}

class Hooks {
	add (name, callback, first) {
		if (typeof arguments[0] != "string") {
			for (var name in arguments[0]) {
				this.add(name, arguments[0][name], arguments[1]);
			}
			return;
		}
		(Array.isArray(name) ? name : [name]).forEach(function (name) {
			this[name] = this[name] || [];
			if (callback) {
				this[name][first ? "unshift" : "push"](callback);
			}
		}, this);
	}
	run (name, env) {
		this[name] = this[name] || [];
		this[name].forEach(function (callback) {
			callback.call(env && env.context ? env.context : env, env);
		});
	}
}
const hooks = new Hooks();
var hooks$1 = hooks;

const WHITES = {
	D50: [0.3457 / 0.3585, 1.00000, (1.0 - 0.3457 - 0.3585) / 0.3585],
	D65: [0.3127 / 0.3290, 1.00000, (1.0 - 0.3127 - 0.3290) / 0.3290],
};
function getWhite (name) {
	if (Array.isArray(name)) {
		return name;
	}
	return WHITES[name];
}
function adapt$1 (W1, W2, XYZ, options = {}) {
	W1 = getWhite(W1);
	W2 = getWhite(W2);
	if (!W1 || !W2) {
		throw new TypeError(
			`Missing white point to convert ${!W1 ? "from" : ""}${!W1 && !W2 ? "/" : ""}${!W2 ? "to" : ""}`,
		);
	}
	if (W1 === W2) {
		return XYZ;
	}
	let env = { W1, W2, XYZ, options };
	hooks$1.run("chromatic-adaptation-start", env);
	if (!env.M) {
		if (env.W1 === WHITES.D65 && env.W2 === WHITES.D50) {
			env.M = [
				[  1.0479297925449969,   0.022946870601609652, -0.05019226628920524  ],
				[  0.02962780877005599,  0.9904344267538799,   -0.017073799063418826 ],
				[ -0.009243040646204504, 0.015055191490298152,  0.7518742814281371   ],
			];
		}
		else if (env.W1 === WHITES.D50 && env.W2 === WHITES.D65) {
			env.M = [
				[  0.955473421488075,    -0.02309845494876471,  0.06325924320057072  ],
				[ -0.0283697093338637,    1.0099953980813041,   0.021041441191917323 ],
				[  0.012314014864481998, -0.020507649298898964, 1.330365926242124    ],
			];
		}
	}
	hooks$1.run("chromatic-adaptation-end", env);
	if (env.M) {
		return multiply_v3_m3x3(env.XYZ, env.M);
	}
	else {
		throw new TypeError("Only Bradford CAT with white points D50 and D65 supported for now.");
	}
}

var defaults = {
	gamut_mapping: "css",
	precision: 5,
	deltaE: "76",
	verbose: globalThis?.process?.env?.NODE_ENV?.toLowerCase() !== "test",
	warn: function warn (msg) {
		if (this.verbose) {
			globalThis?.console?.warn?.(msg);
		}
	},
};

function parse (str, options) {
	let env = {
		str: String(str)?.trim(),
		options,
	};
	hooks$1.run("parse-start", env);
	if (env.color) {
		return env.color;
	}
	env.parsed = parseFunction(env.str);
	let ret;
	let meta = env.options ? (env.options.parseMeta ?? env.options.meta) : null;
	if (env.parsed) {
		let name = env.parsed.name;
		let format;
		let space;
		let coords = env.parsed.args;
		let types = coords.map((c, i) => env.parsed.argMeta[i]?.type);
		if (name === "color") {
			let id = coords.shift();
			types.shift();
			let alternateId = id.startsWith("--") ? id.substring(2) : `--${id}`;
			let ids = [id, alternateId];
			format = ColorSpace.findFormat({ name, id: ids, type: "function" });
			if (!format) {
				let didYouMean;
				let registryId = id in ColorSpace.registry ? id : alternateId;
				if (registryId in ColorSpace.registry) {
					let cssId = ColorSpace.registry[registryId].formats?.color?.id;
					if (cssId) {
						let altColor = str.replace("color(" + id, "color(" + cssId);
						didYouMean = `Did you mean ${altColor}?`;
					}
				}
				throw new TypeError(
					`Cannot parse ${env.str}. ` + (didYouMean ?? "Missing a plugin?"),
				);
			}
			space = format.space;
			if (format.id.startsWith("--") && !id.startsWith("--")) {
				defaults.warn(
					`${space.name} is a non-standard space and not currently supported in the CSS spec. ` +
						`Use prefixed color(${format.id}) instead of color(${id}).`,
				);
			}
			if (id.startsWith("--") && !format.id.startsWith("--")) {
				defaults.warn(
					`${space.name} is a standard space and supported in the CSS spec. ` +
						`Use color(${format.id}) instead of prefixed color(${id}).`,
				);
			}
		}
		else {
			format = ColorSpace.findFormat({ name, type: "function" });
			space = format.space;
		}
		if (meta) {
			Object.assign(meta, {
				format,
				formatId: format.name,
				types,
				commas: env.parsed.commas,
			});
		}
		let alpha = 1;
		if (env.parsed.lastAlpha) {
			alpha = env.parsed.args.pop();
			if (meta) {
				meta.alphaType = types.pop();
			}
		}
		let coordCount = format.coords.length;
		if (coords.length !== coordCount) {
			throw new TypeError(
				`Expected ${coordCount} coordinates for ${space.id} in ${env.str}), got ${coords.length}`,
			);
		}
		coords = format.coerceCoords(coords, types);
		ret = { spaceId: space.id, coords, alpha };
	}
	else {
		spaceloop: for (let space of ColorSpace.all) {
			for (let formatId in space.formats) {
				let format = space.formats[formatId];
				if (format.type !== "custom") {
					continue;
				}
				if (format.test && !format.test(env.str)) {
					continue;
				}
				let formatObject = space.getFormat(format);
				let color = formatObject.parse(env.str);
				if (color) {
					if (meta) {
						Object.assign(meta, { format: formatObject, formatId });
					}
					ret = color;
					break spaceloop;
				}
			}
		}
	}
	if (!ret) {
		throw new TypeError(`Could not parse ${str} as a color. Missing a plugin?`);
	}
	ret.alpha = isNone(ret.alpha)
		? ret.alpha
		: ret.alpha === undefined
			? 1
			: clamp$1(0, ret.alpha, 1);
	return ret;
}
const units = {
	"%": 0.01,
	deg: 1,
	grad: 0.9,
	rad: 180 / Math.PI,
	turn: 360,
};
const regex = {
	function: /^([a-z]+)\(((?:calc\(NaN\)|.)+?)\)$/i,
	number: /^([-+]?(?:[0-9]*\.)?[0-9]+(e[-+]?[0-9]+)?)$/i,
	unitValue: RegExp(`(${Object.keys(units).join("|")})$`),
	singleArgument: /\/?\s*(none|NaN|calc\(NaN\)|[-+\w.]+(?:%|deg|g?rad|turn)?)/g,
};
function parseArgument (rawArg) {
	let meta = {};
	let unit = rawArg.match(regex.unitValue)?.[0];
	let value = (meta.raw = rawArg);
	if (unit) {
		meta.type = unit === "%" ? "<percentage>" : "<angle>";
		meta.unit = unit;
		meta.unitless = Number(value.slice(0, -unit.length));
		value = meta.unitless * units[unit];
	}
	else if (regex.number.test(value)) {
		value = Number(value);
		meta.type = "<number>";
	}
	else if (value === "none") {
		value = null;
	}
	else if (value === "NaN" || value === "calc(NaN)") {
		value = NaN;
		meta.type = "<number>";
	}
	else {
		meta.type = "<ident>";
	}
	return { value:  (value), meta:  (meta) };
}
function parseFunction (str) {
	if (!str) {
		return;
	}
	str = str.trim();
	let parts = str.match(regex.function);
	if (parts) {
		let args = [];
		let argMeta = [];
		let lastAlpha = false;
		let name = parts[1].toLowerCase();
		let separators = parts[2].replace(regex.singleArgument, ($0, rawArg) => {
			let { value, meta } = parseArgument(rawArg);
			if (
				$0.startsWith("/") ||
				(name !== "color" && args.length === 3)
			) {
				lastAlpha = true;
			}
			args.push(value);
			argMeta.push(meta);
			return "";
		});
		return {
			name,
			args,
			argMeta,
			lastAlpha,
			commas: separators.includes(","),
			rawName: parts[1],
			rawArgs: parts[2],
		};
	}
}

function getColor (color, options) {
	if (Array.isArray(color)) {
		return color.map(c => getColor(c, options));
	}
	if (!color) {
		throw new TypeError("Empty color reference");
	}
	if (isString(color)) {
		color = parse(color, options);
	}
	let space = color.space || color.spaceId;
	if (typeof space === "string") {
		color.space = ColorSpace.get(space);
	}
	if (color.alpha === undefined) {
		color.alpha = 1;
	}
	return color;
}

const ε$3 = 0.000075;
class ColorSpace {
	constructor (options) {
		this.id = options.id;
		this.name = options.name;
		this.base = options.base ? ColorSpace.get(options.base) : null;
		this.aliases = options.aliases;
		if (this.base) {
			this.fromBase = options.fromBase;
			this.toBase = options.toBase;
		}
		let coords = options.coords ?? this.base.coords;
		for (let name in coords) {
			if (!("name" in coords[name])) {
				coords[name].name = name;
			}
		}
		this.coords = coords;
		let white = options.white ?? this.base.white ?? "D65";
		this.white = getWhite(white);
		this.formats = options.formats ?? {};
		for (let name in this.formats) {
			let format = this.formats[name];
			format.type ||= "function";
			format.name ||= name;
		}
		if (!this.formats.color?.id) {
			this.formats.color = {
				...(this.formats.color ?? {}),
				id: options.cssId || this.id,
			};
		}
		if (options.gamutSpace) {
			this.gamutSpace =
				options.gamutSpace === "self" ? this : ColorSpace.get(options.gamutSpace);
		}
		else {
			if (this.isPolar) {
				this.gamutSpace = this.base;
			}
			else {
				this.gamutSpace = this;
			}
		}
		if (this.gamutSpace.isUnbounded) {
			this.inGamut = (coords, options) => {
				return true;
			};
		}
		this.referred = options.referred;
		Object.defineProperty(this, "path", {
			value: getPath(this).reverse(),
			writable: false,
			enumerable: true,
			configurable: true,
		});
		hooks$1.run("colorspace-init-end", this);
	}
	inGamut (coords, { epsilon = ε$3 } = {}) {
		if (!this.equals(this.gamutSpace)) {
			coords = this.to(this.gamutSpace, coords);
			return this.gamutSpace.inGamut(coords, { epsilon });
		}
		let coordMeta = Object.values(this.coords);
		return coords.every((c, i) => {
			let meta = coordMeta[i];
			if (meta.type !== "angle" && meta.range) {
				if (isNone(c)) {
					return true;
				}
				let [min, max] = meta.range;
				return (
					(min === undefined || c >= min - epsilon) &&
					(max === undefined || c <= max + epsilon)
				);
			}
			return true;
		});
	}
	get isUnbounded () {
		return Object.values(this.coords).every(coord => !("range" in coord));
	}
	get cssId () {
		return this.formats?.color?.id || this.id;
	}
	get isPolar () {
		for (let id in this.coords) {
			if (this.coords[id].type === "angle") {
				return true;
			}
		}
		return false;
	}
	getFormat (format) {
		if (!format) {
			return null;
		}
		if (format === "default") {
			format = Object.values(this.formats)[0];
		}
		else if (typeof format === "string") {
			format = this.formats[format];
		}
		let ret = Format.get(format, this);
		if (ret !== format && format.name in this.formats) {
			this.formats[format.name] = ret;
		}
		return ret;
	}
	equals (space) {
		if (!space) {
			return false;
		}
		return this === space || this.id === space || this.id === space.id;
	}
	to (space, coords) {
		if (arguments.length === 1) {
			const color = getColor(space);
			[space, coords] = [color.space, color.coords];
		}
		space = ColorSpace.get(space);
		if (this.equals(space)) {
			return coords;
		}
		coords = coords.map(c => (isNone(c) ? 0 : c));
		let myPath = this.path;
		let otherPath = space.path;
		let connectionSpace, connectionSpaceIndex;
		for (let i = 0; i < myPath.length; i++) {
			if (myPath[i].equals(otherPath[i])) {
				connectionSpace = myPath[i];
				connectionSpaceIndex = i;
			}
			else {
				break;
			}
		}
		if (!connectionSpace) {
			throw new Error(
				`Cannot convert between color spaces ${this} and ${space}: no connection space was found`,
			);
		}
		for (let i = myPath.length - 1; i > connectionSpaceIndex; i--) {
			coords = myPath[i].toBase(coords);
		}
		for (let i = connectionSpaceIndex + 1; i < otherPath.length; i++) {
			coords = otherPath[i].fromBase(coords);
		}
		return coords;
	}
	from (space, coords) {
		if (arguments.length === 1) {
			const color = getColor(space);
			[space, coords] = [color.space, color.coords];
		}
		space = ColorSpace.get(space);
		return space.to(this, coords);
	}
	toString () {
		return `${this.name} (${this.id})`;
	}
	getMinCoords () {
		let ret = [];
		for (let id in this.coords) {
			let meta = this.coords[id];
			let range = meta.range || meta.refRange;
			ret.push(range?.min ?? 0);
		}
		return ret;
	}
	static registry = {};
	static get all () {
		return [...new Set(Object.values(ColorSpace.registry))];
	}
	static register (id, space) {
		if (arguments.length === 1) {
			space = arguments[0];
			id = space.id;
		}
		space = this.get(space);
		if (this.registry[id] && this.registry[id] !== space) {
			throw new Error(`Duplicate color space registration: '${id}'`);
		}
		this.registry[id] = space;
		if (arguments.length === 1 && space.aliases) {
			for (let alias of space.aliases) {
				this.register(alias, space);
			}
		}
		return space;
	}
	static get (space, ...alternatives) {
		if (!space || isInstance(space, this)) {
			return space;
		}
		let argType = type(space);
		if (argType === "string") {
			let ret = ColorSpace.registry[space.toLowerCase()];
			if (!ret) {
				throw new TypeError(`No color space found with id = "${space}"`);
			}
			return ret;
		}
		if (alternatives.length) {
			return ColorSpace.get(...alternatives);
		}
		throw new TypeError(`${space} is not a valid color space`);
	}
	static findFormat (filters, spaces = ColorSpace.all) {
		if (!filters) {
			return null;
		}
		if (typeof filters === "string") {
			filters = { name: filters };
		}
		for (let space of spaces) {
			for (let [name, format] of Object.entries(space.formats)) {
				format.name ??= name;
				format.type ??= "function";
				let matches =
					(!filters.name || format.name === filters.name) &&
					(!filters.type || format.type === filters.type);
				if (filters.id) {
					let ids = format.ids || [format.id];
					let filterIds = Array.isArray(filters.id) ? filters.id : [filters.id];
					matches &&= filterIds.some(id => ids.includes(id));
				}
				if (matches) {
					let ret = Format.get(format, space);
					if (ret !== format) {
						space.formats[format.name] = ret;
					}
					return ret;
				}
			}
		}
		return null;
	}
	static resolveCoord (ref, workingSpace) {
		let coordType = type(ref);
		let space, coord;
		if (coordType === "string") {
			if (ref.includes(".")) {
				[space, coord] = ref.split(".");
			}
			else {
				[space, coord] = [, ref];
			}
		}
		else if (Array.isArray(ref)) {
			[space, coord] = ref;
		}
		else {
			space = ref.space;
			coord = ref.coordId;
		}
		space = ColorSpace.get(space);
		if (!space) {
			space = workingSpace;
		}
		if (!space) {
			throw new TypeError(
				`Cannot resolve coordinate reference ${ref}: No color space specified and relative references are not allowed here`,
			);
		}
		coordType = type(coord);
		if (coordType === "number" || (coordType === "string" && coord >= 0)) {
			let meta = Object.entries(space.coords)[coord];
			if (meta) {
				return { space, id: meta[0], index: coord, ...meta[1] };
			}
		}
		space = ColorSpace.get(space);
		let normalizedCoord = coord.toLowerCase();
		let i = 0;
		for (let id in space.coords) {
			let meta = space.coords[id];
			if (
				id.toLowerCase() === normalizedCoord ||
				meta.name?.toLowerCase() === normalizedCoord
			) {
				return { space, id, index: i, ...meta };
			}
			i++;
		}
		throw new TypeError(
			`No "${coord}" coordinate found in ${space.name}. Its coordinates are: ${Object.keys(space.coords).join(", ")}`,
		);
	}
	static DEFAULT_FORMAT = {
		type: "functions",
		name: "color",
	};
}
function getPath (space) {
	let ret = [space];
	for (let s = space; (s = s.base); ) {
		ret.push(s);
	}
	return ret;
}

var xyz_d65 = new ColorSpace({
	id: "xyz-d65",
	name: "XYZ D65",
	coords: {
		x: {
			refRange: [0, 1],
			name: "X",
		},
		y: {
			refRange: [0, 1],
			name: "Y",
		},
		z: {
			refRange: [0, 1],
			name: "Z",
		},
	},
	white: "D65",
	formats: {
		color: {
			ids: ["xyz-d65", "xyz"],
		},
	},
	aliases: ["xyz"],
});

class RGBColorSpace extends ColorSpace {
	constructor (options) {
		if (!options.coords) {
			options.coords = {
				r: {
					range: [0, 1],
					name: "Red",
				},
				g: {
					range: [0, 1],
					name: "Green",
				},
				b: {
					range: [0, 1],
					name: "Blue",
				},
			};
		}
		if (!options.base) {
			options.base = xyz_d65;
		}
		if (options.toXYZ_M && options.fromXYZ_M) {
			options.toBase ??= rgb => {
				let xyz = multiply_v3_m3x3(rgb, options.toXYZ_M);
				if (this.white !== this.base.white) {
					xyz = adapt$1(this.white, this.base.white, xyz);
				}
				return xyz;
			};
			options.fromBase ??= xyz => {
				xyz = adapt$1(this.base.white, this.white, xyz);
				return multiply_v3_m3x3(xyz, options.fromXYZ_M);
			};
		}
		options.referred ??= "display";
		super(options);
	}
}

function getAll (color, options) {
	color = getColor(color);
	let space = ColorSpace.get(options, options?.space);
	let precision = options?.precision;
	let coords;
	if (!space || color.space.equals(space)) {
		coords = color.coords.slice();
	}
	else {
		coords = space.from(color);
	}
	return precision === undefined ? coords : coords.map(coord => toPrecision(coord, precision));
}

function get (color, prop) {
	color = getColor(color);
	if (prop === "alpha") {
		return color.alpha ?? 1;
	}
	let { space, index } = ColorSpace.resolveCoord(prop, color.space);
	let coords = getAll(color, space);
	return coords[index];
}

function setAll (color, space, coords, alpha) {
	color = getColor(color);
	if (Array.isArray(space)) {
		[space, coords, alpha] = [color.space, space, coords];
	}
	space = ColorSpace.get(space);
	color.coords = space === color.space ? coords.slice() : space.to(color.space, coords);
	if (alpha !== undefined) {
		color.alpha = alpha;
	}
	return color;
}
setAll.returns = "color";

function set (color, prop, value) {
	color = getColor(color);
	if (arguments.length === 2 && type(arguments[1]) === "object") {
		let object = arguments[1];
		for (let p in object) {
			set(color, p, object[p]);
		}
	}
	else {
		if (typeof value === "function") {
			value = value(get(color, prop));
		}
		if (prop === "alpha") {
			color.alpha = value;
		}
		else {
			let { space, index } = ColorSpace.resolveCoord(prop, color.space);
			let coords = getAll(color, space);
			coords[index] = value;
			setAll(color, space, coords);
		}
	}
	return color;
}
set.returns = "color";

var XYZ_D50 = new ColorSpace({
	id: "xyz-d50",
	name: "XYZ D50",
	white: "D50",
	base: xyz_d65,
	fromBase: coords => adapt$1(xyz_d65.white, "D50", coords),
	toBase: coords => adapt$1("D50", xyz_d65.white, coords),
});

const ε$2 = 216 / 24389;
const ε3 = 24 / 116;
const κ$1 = 24389 / 27;
let white$2 = WHITES.D50;
var lab = new ColorSpace({
	id: "lab",
	name: "Lab",
	coords: {
		l: {
			refRange: [0, 100],
			name: "Lightness",
		},
		a: {
			refRange: [-125, 125],
		},
		b: {
			refRange: [-125, 125],
		},
	},
	white: white$2,
	base: XYZ_D50,
	fromBase (XYZ) {
		let xyz = XYZ.map((value, i) => value / white$2[i]);
		let f = xyz.map(value => (value > ε$2 ? Math.cbrt(value) : (κ$1 * value + 16) / 116));
		let L = 116 * f[1] - 16;
		let a = 500 * (f[0] - f[1]);
		let b = 200 * (f[1] - f[2]);
		return [L, a, b];
	},
	toBase (Lab) {
		let [L, a, b] = Lab;
		let f = [];
		f[1] = (L + 16) / 116;
		f[0] = a / 500 + f[1];
		f[2] = f[1] - b / 200;
		let xyz = [
			f[0]   > ε3 ? Math.pow(f[0], 3)                : (116 * f[0] - 16) / κ$1,
			Lab[0] > 8  ? Math.pow((Lab[0] + 16) / 116, 3) : Lab[0] / κ$1,
			f[2]   > ε3 ? Math.pow(f[2], 3)                : (116 * f[2] - 16) / κ$1,
		];
		return xyz.map((value, i) => value * white$2[i]);
	},
	formats: {
		lab: {
			coords: [
				"<percentage> | <number>",
				"<number> | <percentage>",
				"<number> | <percentage>",
			],
		},
	},
});

function constrain (angle) {
	if (typeof angle !== "number") {
		return angle;
	}
	return ((angle % 360) + 360) % 360;
}

var lch = new ColorSpace({
	id: "lch",
	name: "LCH",
	coords: {
		l: {
			refRange: [0, 100],
			name: "Lightness",
		},
		c: {
			refRange: [0, 150],
			name: "Chroma",
		},
		h: {
			refRange: [0, 360],
			type: "angle",
			name: "Hue",
		},
	},
	base: lab,
	fromBase (Lab) {
		if (this.ε === undefined) {
			let range = Object.values(this.base.coords)[1].refRange;
			let extent = range[1] - range[0];
			this.ε = extent / 100000;
		}
		let [L, a, b] = Lab;
		let isAchromatic = Math.abs(a) < this.ε && Math.abs(b) < this.ε;
		let h = isAchromatic ? null : constrain((Math.atan2(b, a) * 180) / Math.PI);
		let C = isAchromatic ? 0 : Math.sqrt(a ** 2 + b ** 2);
		return [L, C, h];
	},
	toBase (lch) {
		let [L, C, h] = lch;
		let a = null,
			b = null;
		if (!isNone(h)) {
			C = C < 0 ? 0 : C;
			a = C * Math.cos((h * Math.PI) / 180);
			b = C * Math.sin((h * Math.PI) / 180);
		}
		return [L, a, b];
	},
	formats: {
		lch: {
			coords: ["<percentage> | <number>", "<number> | <percentage>", "<number> | <angle>"],
		},
	},
});

const Gfactor = 25 ** 7;
const π$1 = Math.PI;
const r2d = 180 / π$1;
const d2r$1 = π$1 / 180;
function pow7 (x) {
	const x2 = x * x;
	const x7 = x2 * x2 * x2 * x;
	return x7;
}
function deltaE2000 (color, sample, { kL = 1, kC = 1, kH = 1 } = {}) {
	[color, sample] = getColor([color, sample]);
	let [L1, a1, b1] = lab.from(color);
	let C1 = lch.from(lab, [L1, a1, b1])[1];
	let [L2, a2, b2] = lab.from(sample);
	let C2 = lch.from(lab, [L2, a2, b2])[1];
	if (C1 < 0) {
		C1 = 0;
	}
	if (C2 < 0) {
		C2 = 0;
	}
	let Cbar = (C1 + C2) / 2;
	let C7 = pow7(Cbar);
	let G = 0.5 * (1 - Math.sqrt(C7 / (C7 + Gfactor)));
	let adash1 = (1 + G) * a1;
	let adash2 = (1 + G) * a2;
	let Cdash1 = Math.sqrt(adash1 ** 2 + b1 ** 2);
	let Cdash2 = Math.sqrt(adash2 ** 2 + b2 ** 2);
	let h1 = adash1 === 0 && b1 === 0 ? 0 : Math.atan2(b1, adash1);
	let h2 = adash2 === 0 && b2 === 0 ? 0 : Math.atan2(b2, adash2);
	if (h1 < 0) {
		h1 += 2 * π$1;
	}
	if (h2 < 0) {
		h2 += 2 * π$1;
	}
	h1 *= r2d;
	h2 *= r2d;
	let ΔL = L2 - L1;
	let ΔC = Cdash2 - Cdash1;
	let hdiff = h2 - h1;
	let hsum = h1 + h2;
	let habs = Math.abs(hdiff);
	let Δh;
	if (Cdash1 * Cdash2 === 0) {
		Δh = 0;
	}
	else if (habs <= 180) {
		Δh = hdiff;
	}
	else if (hdiff > 180) {
		Δh = hdiff - 360;
	}
	else if (hdiff < -180) {
		Δh = hdiff + 360;
	}
	else {
		defaults.warn("the unthinkable has happened");
	}
	let ΔH = 2 * Math.sqrt(Cdash2 * Cdash1) * Math.sin((Δh * d2r$1) / 2);
	let Ldash = (L1 + L2) / 2;
	let Cdash = (Cdash1 + Cdash2) / 2;
	let Cdash7 = pow7(Cdash);
	let hdash;
	if (Cdash1 * Cdash2 === 0) {
		hdash = hsum;
	}
	else if (habs <= 180) {
		hdash = hsum / 2;
	}
	else if (hsum < 360) {
		hdash = (hsum + 360) / 2;
	}
	else {
		hdash = (hsum - 360) / 2;
	}
	let lsq = (Ldash - 50) ** 2;
	let SL = 1 + (0.015 * lsq) / Math.sqrt(20 + lsq);
	let SC = 1 + 0.045 * Cdash;
	let T = 1;
	T -= 0.17 * Math.cos((hdash - 30) * d2r$1);
	T += 0.24 * Math.cos(2 * hdash * d2r$1);
	T += 0.32 * Math.cos((3 * hdash + 6) * d2r$1);
	T -= 0.2 * Math.cos((4 * hdash - 63) * d2r$1);
	let SH = 1 + 0.015 * Cdash * T;
	let Δθ = 30 * Math.exp(-1 * ((hdash - 275) / 25) ** 2);
	let RC = 2 * Math.sqrt(Cdash7 / (Cdash7 + Gfactor));
	let RT = -1 * Math.sin(2 * Δθ * d2r$1) * RC;
	let dE = (ΔL / (kL * SL)) ** 2;
	dE += (ΔC / (kC * SC)) ** 2;
	dE += (ΔH / (kH * SH)) ** 2;
	dE += RT * (ΔC / (kC * SC)) * (ΔH / (kH * SH));
	return Math.sqrt(dE);
}

const XYZtoLMS_M$1 = [
	[ 0.8190224379967030, 0.3619062600528904, -0.1288737815209879 ],
	[ 0.0329836539323885, 0.9292868615863434,  0.0361446663506424 ],
	[ 0.0481771893596242, 0.2642395317527308,  0.6335478284694309 ],
];
const LMStoXYZ_M$1 = [
	[  1.2268798758459243, -0.5578149944602171,  0.2813910456659647 ],
	[ -0.0405757452148008,  1.1122868032803170, -0.0717110580655164 ],
	[ -0.0763729366746601, -0.4214933324022432,  1.5869240198367816 ],
];
const LMStoLab_M = [
	[ 0.2104542683093140,  0.7936177747023054, -0.0040720430116193 ],
	[ 1.9779985324311684, -2.4285922420485799,  0.4505937096174110 ],
	[ 0.0259040424655478,  0.7827717124575296, -0.8086757549230774 ],
];
const LabtoLMS_M = [
	[ 1.0000000000000000,  0.3963377773761749,  0.2158037573099136 ],
	[ 1.0000000000000000, -0.1055613458156586, -0.0638541728258133 ],
	[ 1.0000000000000000, -0.0894841775298119, -1.2914855480194092 ],
];
var Oklab = new ColorSpace({
	id: "oklab",
	name: "Oklab",
	coords: {
		l: {
			refRange: [0, 1],
			name: "Lightness",
		},
		a: {
			refRange: [-0.4, 0.4],
		},
		b: {
			refRange: [-0.4, 0.4],
		},
	},
	white: "D65",
	base: xyz_d65,
	fromBase (XYZ) {
		let LMS = multiply_v3_m3x3(XYZ, XYZtoLMS_M$1);
		LMS[0] = Math.cbrt(LMS[0]);
		LMS[1] = Math.cbrt(LMS[1]);
		LMS[2] = Math.cbrt(LMS[2]);
		return multiply_v3_m3x3(LMS, LMStoLab_M, LMS);
	},
	toBase (OKLab) {
		let LMSg = multiply_v3_m3x3(OKLab, LabtoLMS_M);
		LMSg[0] = LMSg[0] ** 3;
		LMSg[1] = LMSg[1] ** 3;
		LMSg[2] = LMSg[2] ** 3;
		return multiply_v3_m3x3(LMSg, LMStoXYZ_M$1, LMSg);
	},
	formats: {
		oklab: {
			coords: [
				"<percentage> | <number>",
				"<number> | <percentage>",
				"<number> | <percentage>",
			],
		},
	},
});

function deltaEOK (color, sample) {
	[color, sample] = getColor([color, sample]);
	let [L1, a1, b1] = Oklab.from(color);
	let [L2, a2, b2] = Oklab.from(sample);
	let ΔL = L1 - L2;
	let Δa = a1 - a2;
	let Δb = b1 - b2;
	return Math.sqrt(ΔL ** 2 + Δa ** 2 + Δb ** 2);
}

const ε$1 = 0.000075;
function inGamut (color, space, { epsilon = ε$1 } = {}) {
	color = getColor(color);
	if (!space) {
		space = color.space;
	}
	space = ColorSpace.get(space);
	let coords = color.coords;
	if (space !== color.space) {
		coords = space.from(color);
	}
	return space.inGamut(coords, { epsilon });
}

function clone (color) {
	return {
		space: color.space,
		coords:  (color.coords.slice()),
		alpha: color.alpha,
	};
}

function distance (color1, color2, space = "lab") {
	space = ColorSpace.get(space);
	let coords1 = space.from(color1);
	let coords2 = space.from(color2);
	return Math.sqrt(
		coords1.reduce((acc, c1, i) => {
			let c2 = coords2[i];
			if (isNone(c1) || isNone(c2)) {
				return acc;
			}
			return acc + (c2 - c1) ** 2;
		}, 0),
	);
}

function deltaE76 (color, sample) {
	return distance(color, sample, "lab");
}

const π = Math.PI;
const d2r = π / 180;
function deltaECMC (color, sample, { l = 2, c = 1 } = {}) {
	[color, sample] = getColor([color, sample]);
	let [L1, a1, b1] = lab.from(color);
	let [, C1, H1] = lch.from(lab, [L1, a1, b1]);
	let [L2, a2, b2] = lab.from(sample);
	let C2 = lch.from(lab, [L2, a2, b2])[1];
	if (C1 < 0) {
		C1 = 0;
	}
	if (C2 < 0) {
		C2 = 0;
	}
	let ΔL = L1 - L2;
	let ΔC = C1 - C2;
	let Δa = a1 - a2;
	let Δb = b1 - b2;
	let H2 = Δa ** 2 + Δb ** 2 - ΔC ** 2;
	let SL = 0.511;
	if (L1 >= 16) {
		SL = (0.040975 * L1) / (1 + 0.01765 * L1);
	}
	let SC = (0.0638 * C1) / (1 + 0.0131 * C1) + 0.638;
	let T;
	if (isNone(H1)) {
		H1 = 0;
	}
	if (H1 >= 164 && H1 <= 345) {
		T = 0.56 + Math.abs(0.2 * Math.cos((H1 + 168) * d2r));
	}
	else {
		T = 0.36 + Math.abs(0.4 * Math.cos((H1 + 35) * d2r));
	}
	let C4 = Math.pow(C1, 4);
	let F = Math.sqrt(C4 / (C4 + 1900));
	let SH = SC * (F * T + 1 - F);
	let dE = (ΔL / (l * SL)) ** 2;
	dE += (ΔC / (c * SC)) ** 2;
	dE += H2 / SH ** 2;
	return Math.sqrt(dE);
}

const Yw = 203;
var XYZ_Abs_D65 = new ColorSpace({
	id: "xyz-abs-d65",
	cssId: "--xyz-abs-d65",
	name: "Absolute XYZ D65",
	coords: {
		x: {
			refRange: [0, 9504.7],
			name: "Xa",
		},
		y: {
			refRange: [0, 10000],
			name: "Ya",
		},
		z: {
			refRange: [0, 10888.3],
			name: "Za",
		},
	},
	base: xyz_d65,
	fromBase (XYZ) {
		return XYZ.map(v => v * Yw);
	},
	toBase (AbsXYZ) {
		return AbsXYZ.map(v => v / Yw);
	},
});

const b$1 = 1.15;
const g$1 = 0.66;
const n$1 = 2610 / 2 ** 14;
const ninv = 2 ** 14 / 2610;
const c1$1 = 3424 / 2 ** 12;
const c2$1 = 2413 / 2 ** 7;
const c3$1 = 2392 / 2 ** 7;
const p$1 = (1.7 * 2523) / 2 ** 5;
const pinv = 2 ** 5 / (1.7 * 2523);
const d$1 = -0.56;
const d0 = 1.6295499532821566e-11;
const XYZtoCone_M = [
	[  0.41478972, 0.579999,  0.0146480 ],
	[ -0.2015100,  1.120649,  0.0531008 ],
	[ -0.0166008,  0.264800,  0.6684799 ],
];
const ConetoXYZ_M = [
	[  1.9242264357876067,  -1.0047923125953657,  0.037651404030618   ],
	[  0.35031676209499907,  0.7264811939316552, -0.06538442294808501 ],
	[ -0.09098281098284752, -0.3127282905230739,  1.5227665613052603  ],
];
const ConetoIab_M = [
	[  0.5,       0.5,       0        ],
	[  3.524000, -4.066708,  0.542708 ],
	[  0.199076,  1.096799, -1.295875 ],
];
const IabtoCone_M = [
	[ 1,                   0.13860504327153927,   0.05804731615611883 ],
	[ 1,                  -0.1386050432715393,   -0.058047316156118904 ],
	[ 1,                  -0.09601924202631895,  -0.81189189605603900  ],
];
var Jzazbz = new ColorSpace({
	id: "jzazbz",
	name: "Jzazbz",
	coords: {
		jz: {
			refRange: [0, 1],
			name: "Jz",
		},
		az: {
			refRange: [-0.21, 0.21],
		},
		bz: {
			refRange: [-0.21, 0.21],
		},
	},
	base: XYZ_Abs_D65,
	fromBase (XYZ) {
		let [Xa, Ya, Za] = XYZ;
		let Xm = b$1 * Xa - (b$1 - 1) * Za;
		let Ym = g$1 * Ya - (g$1 - 1) * Xa;
		let LMS = multiply_v3_m3x3([Xm, Ym, Za], XYZtoCone_M);
		let PQLMS =  (
			LMS.map(function (val) {
				let num = c1$1 + c2$1 * spow(val / 10000, n$1);
				let denom = 1 + c3$1 * spow(val / 10000, n$1);
				return spow(num / denom, p$1);
			})
		);
		let [Iz, az, bz] = multiply_v3_m3x3(PQLMS, ConetoIab_M);
		let Jz = ((1 + d$1) * Iz) / (1 + d$1 * Iz) - d0;
		return [Jz, az, bz];
	},
	toBase (Jzazbz) {
		let [Jz, az, bz] = Jzazbz;
		let Iz = (Jz + d0) / (1 + d$1 - d$1 * (Jz + d0));
		let PQLMS = multiply_v3_m3x3([Iz, az, bz], IabtoCone_M);
		let LMS =  (
			PQLMS.map(function (val) {
				let num = c1$1 - spow(val, pinv);
				let denom = c3$1 * spow(val, pinv) - c2$1;
				let x = 10000 * spow(num / denom, ninv);
				return x;
			})
		);
		let [Xm, Ym, Za] = multiply_v3_m3x3(LMS, ConetoXYZ_M);
		let Xa = (Xm + (b$1 - 1) * Za) / b$1;
		let Ya = (Ym + (g$1 - 1) * Xa) / g$1;
		return [Xa, Ya, Za];
	},
	formats: {
		jzazbz: {
			coords: [
				"<percentage> | <number>",
				"<number> | <percentage>",
				"<number> | <percentage>",
			],
		},
	},
});

var jzczhz = new ColorSpace({
	id: "jzczhz",
	name: "JzCzHz",
	coords: {
		jz: {
			refRange: [0, 1],
			name: "Jz",
		},
		cz: {
			refRange: [0, 0.26],
			name: "Chroma",
		},
		hz: {
			refRange: [0, 360],
			type: "angle",
			name: "Hue",
		},
	},
	base: Jzazbz,
	fromBase: lch.fromBase,
	toBase: lch.toBase,
	formats: {
		jzczhz: {
			coords: ["<percentage> | <number>", "<number> | <percentage>", "<number> | <angle>"],
		},
	},
});

function deltaEJz (color, sample) {
	[color, sample] = getColor([color, sample]);
	let [Jz1, Cz1, Hz1] = jzczhz.from(color);
	let [Jz2, Cz2, Hz2] = jzczhz.from(sample);
	let ΔJ = Jz1 - Jz2;
	let ΔC = Cz1 - Cz2;
	if (isNone(Hz1) && isNone(Hz2)) {
		Hz1 = 0;
		Hz2 = 0;
	}
	else if (isNone(Hz1)) {
		Hz1 = Hz2;
	}
	else if (isNone(Hz2)) {
		Hz2 = Hz1;
	}
	let Δh = Hz1 - Hz2;
	let ΔH = 2 * Math.sqrt(Cz1 * Cz2) * Math.sin((Δh / 2) * (Math.PI / 180));
	return Math.sqrt(ΔJ ** 2 + ΔC ** 2 + ΔH ** 2);
}

const c1 = 3424 / 4096;
const c2 = 2413 / 128;
const c3 = 2392 / 128;
const m1$1 = 2610 / 16384;
const m2 = 2523 / 32;
const im1 = 16384 / 2610;
const im2 = 32 / 2523;
const XYZtoLMS_M = [
	[  0.3592832590121217,  0.6976051147779502, -0.0358915932320290 ],
	[ -0.1920808463704993,  1.1004767970374321,  0.0753748658519118 ],
	[  0.0070797844607479,  0.0748396662186362,  0.8433265453898765 ],
];
const LMStoIPT_M = [
	[  2048 / 4096,   2048 / 4096,       0      ],
	[  6610 / 4096, -13613 / 4096,  7003 / 4096 ],
	[ 17933 / 4096, -17390 / 4096,  -543 / 4096 ],
];
const IPTtoLMS_M = [
	[ 0.9999999999999998,  0.0086090370379328,  0.1110296250030260 ],
	[ 0.9999999999999998, -0.0086090370379328, -0.1110296250030259 ],
	[ 0.9999999999999998,  0.5600313357106791, -0.3206271749873188 ],
];
const LMStoXYZ_M = [
	[  2.0701522183894223, -1.3263473389671563,  0.2066510476294053 ],
	[  0.3647385209748072,  0.6805660249472273, -0.0453045459220347 ],
	[ -0.0497472075358123, -0.0492609666966131,  1.1880659249923042 ],
];
var ictcp = new ColorSpace({
	id: "ictcp",
	name: "ICTCP",
	coords: {
		i: {
			refRange: [0, 1],
			name: "I",
		},
		ct: {
			refRange: [-0.5, 0.5],
			name: "CT",
		},
		cp: {
			refRange: [-0.5, 0.5],
			name: "CP",
		},
	},
	base: XYZ_Abs_D65,
	fromBase (XYZ) {
		let LMS = multiply_v3_m3x3(XYZ, XYZtoLMS_M);
		return LMStoICtCp(LMS);
	},
	toBase (ICtCp) {
		let LMS = ICtCptoLMS(ICtCp);
		return multiply_v3_m3x3(LMS, LMStoXYZ_M);
	},
	formats: {
		ictcp: {
			coords: [
				"<percentage> | <number>",
				"<number> | <percentage>",
				"<number> | <percentage>",
			],
		},
	},
});
function LMStoICtCp (LMS) {
	let PQLMS =  (
		LMS.map(function (val) {
			let num = c1 + c2 * (val / 10000) ** m1$1;
			let denom = 1 + c3 * (val / 10000) ** m1$1;
			return (num / denom) ** m2;
		})
	);
	return multiply_v3_m3x3(PQLMS, LMStoIPT_M);
}
function ICtCptoLMS (ICtCp) {
	let PQLMS = multiply_v3_m3x3(ICtCp, IPTtoLMS_M);
	let LMS =  (
		PQLMS.map(function (val) {
			let num = Math.max(val ** im2 - c1, 0);
			let denom = c2 - c3 * val ** im2;
			return 10000 * (num / denom) ** im1;
		})
	);
	return LMS;
}

function deltaEITP (color, sample) {
	[color, sample] = getColor([color, sample]);
	let [I1, T1, P1] = ictcp.from(color);
	let [I2, T2, P2] = ictcp.from(sample);
	return 720 * Math.sqrt((I1 - I2) ** 2 + 0.25 * (T1 - T2) ** 2 + (P1 - P2) ** 2);
}

function deltaEOK2 (color, sample) {
	[color, sample] = getColor([color, sample]);
	let abscale = 2;
	let [L1, a1, b1] = Oklab.from(color);
	let [L2, a2, b2] = Oklab.from(sample);
	let ΔL = L1 - L2;
	let Δa = abscale * (a1 - a2);
	let Δb = abscale * (b1 - b2);
	return Math.sqrt(ΔL ** 2 + Δa ** 2 + Δb ** 2);
}

const white$1 = WHITES.D65;
const adaptedCoef = 0.42;
const adaptedCoefInv = 1 / adaptedCoef;
const tau = 2 * Math.PI;
const cat16 = [
	[  0.401288,  0.650173, -0.051461 ],
	[ -0.250268,  1.204414,  0.045854 ],
	[ -0.002079,  0.048952,  0.953127 ],
];
const cat16Inv = [
	[1.8620678550872327, -1.0112546305316843, 0.14918677544445175],
	[0.38752654323613717, 0.6214474419314753, -0.008973985167612518],
	[-0.015841498849333856, -0.03412293802851557, 1.0499644368778496],
];
const m1 = [
	[460.0, 451.0, 288.0],
	[460.0, -891.0, -261.0],
	[460.0, -220.0, -6300.0],
];
const surroundMap = {
	dark: [0.8, 0.525, 0.8],
	dim: [0.9, 0.59, 0.9],
	average: [1, 0.69, 1],
};
const hueQuadMap = {
	h: [20.14, 90.0, 164.25, 237.53, 380.14],
	e: [0.8, 0.7, 1.0, 1.2, 0.8],
	H: [0.0, 100.0, 200.0, 300.0, 400.0],
};
const rad2deg = 180 / Math.PI;
const deg2rad$1 = Math.PI / 180;
function adapt (coords, fl) {
	const temp =  (
		coords.map(c => {
			const x = spow(fl * Math.abs(c) * 0.01, adaptedCoef);
			return (400 * copySign(x, c)) / (x + 27.13);
		})
	);
	return temp;
}
function unadapt (adapted, fl) {
	const constant = (100 / fl) * 27.13 ** adaptedCoefInv;
	return  (
		adapted.map(c => {
			const cabs = Math.abs(c);
			return copySign(constant * spow(cabs / (400 - cabs), adaptedCoefInv), c);
		})
	);
}
function hueQuadrature (h) {
	let hp = constrain(h);
	if (hp <= hueQuadMap.h[0]) {
		hp += 360;
	}
	const i = bisectLeft(hueQuadMap.h, hp) - 1;
	const [hi, hii] = hueQuadMap.h.slice(i, i + 2);
	const [ei, eii] = hueQuadMap.e.slice(i, i + 2);
	const Hi = hueQuadMap.H[i];
	const t = (hp - hi) / ei;
	return Hi + (100 * t) / (t + (hii - hp) / eii);
}
function invHueQuadrature (H) {
	let Hp = ((H % 400) + 400) % 400;
	const i = Math.floor(0.01 * Hp);
	Hp = Hp % 100;
	const [hi, hii] = hueQuadMap.h.slice(i, i + 2);
	const [ei, eii] = hueQuadMap.e.slice(i, i + 2);
	return constrain((Hp * (eii * hi - ei * hii) - 100 * hi * eii) / (Hp * (eii - ei) - 100 * eii));
}
function environment (
	refWhite,
	adaptingLuminance,
	backgroundLuminance,
	surround,
	discounting,
) {
	const env = {};
	env.discounting = discounting;
	env.refWhite = refWhite;
	env.surround = surround;
	const xyzW =  (
		refWhite.map(c => {
			return c * 100;
		})
	);
	env.la = adaptingLuminance;
	env.yb = backgroundLuminance;
	const yw = xyzW[1];
	const rgbW = multiply_v3_m3x3(xyzW, cat16);
	let values = surroundMap[env.surround];
	const f = values[0];
	env.c = values[1];
	env.nc = values[2];
	const k = 1 / (5 * env.la + 1);
	const k4 = k ** 4;
	env.fl = k4 * env.la + 0.1 * (1 - k4) * (1 - k4) * Math.cbrt(5 * env.la);
	env.flRoot = env.fl ** 0.25;
	env.n = env.yb / yw;
	env.z = 1.48 + Math.sqrt(env.n);
	env.nbb = 0.725 * env.n ** -0.2;
	env.ncb = env.nbb;
	const d = discounting
		? 1
		: Math.max(Math.min(f * (1 - (1 / 3.6) * Math.exp((-env.la - 42) / 92)), 1), 0);
	env.dRgb =  (
		rgbW.map(c => {
			return interpolate(1, yw / c, d);
		})
	);
	env.dRgbInv =  (
		env.dRgb.map(c => {
			return 1 / c;
		})
	);
	const rgbCW =  (
		rgbW.map((c, i) => {
			return c * env.dRgb[i];
		})
	);
	const rgbAW = adapt(rgbCW, env.fl);
	env.aW = env.nbb * (2 * rgbAW[0] + rgbAW[1] + 0.05 * rgbAW[2]);
	return env;
}
const viewingConditions$1 = environment(white$1, (64 / Math.PI) * 0.2, 20, "average", false);
function fromCam16 (cam16, env) {
	if (!((cam16.J !== undefined) ^ (cam16.Q !== undefined))) {
		throw new Error("Conversion requires one and only one: 'J' or 'Q'");
	}
	if (!((cam16.C !== undefined) ^ (cam16.M !== undefined) ^ (cam16.s !== undefined))) {
		throw new Error("Conversion requires one and only one: 'C', 'M' or 's'");
	}
	if (!((cam16.h !== undefined) ^ (cam16.H !== undefined))) {
		throw new Error("Conversion requires one and only one: 'h' or 'H'");
	}
	if (cam16.J === 0.0 || cam16.Q === 0.0) {
		return [0.0, 0.0, 0.0];
	}
	let hRad = 0.0;
	if (cam16.h !== undefined) {
		hRad = constrain(cam16.h) * deg2rad$1;
	}
	else {
		hRad = invHueQuadrature(cam16.H) * deg2rad$1;
	}
	const cosh = Math.cos(hRad);
	const sinh = Math.sin(hRad);
	let Jroot = 0.0;
	if (cam16.J !== undefined) {
		Jroot = spow(cam16.J, 1 / 2) * 0.1;
	}
	else if (cam16.Q !== undefined) {
		Jroot = (0.25 * env.c * cam16.Q) / ((env.aW + 4) * env.flRoot);
	}
	let alpha = 0.0;
	if (cam16.C !== undefined) {
		alpha = cam16.C / Jroot;
	}
	else if (cam16.M !== undefined) {
		alpha = cam16.M / env.flRoot / Jroot;
	}
	else if (cam16.s !== undefined) {
		alpha = (0.0004 * cam16.s ** 2 * (env.aW + 4)) / env.c;
	}
	const t = spow(alpha * Math.pow(1.64 - Math.pow(0.29, env.n), -0.73), 10 / 9);
	const et = 0.25 * (Math.cos(hRad + 2) + 3.8);
	const A = env.aW * spow(Jroot, 2 / env.c / env.z);
	const p1 = (5e4 / 13) * env.nc * env.ncb * et;
	const p2 = A / env.nbb;
	const r = 23 * (p2 + 0.305) * zdiv(t, 23 * p1 + t * (11 * cosh + 108 * sinh));
	const a = r * cosh;
	const b = r * sinh;
	const rgb_c = unadapt(
		(
			multiply_v3_m3x3([p2, a, b], m1).map(c => {
				return (c * 1) / 1403;
			})
		),
		env.fl,
	);
	return  (
		multiply_v3_m3x3(
			 (
				rgb_c.map((c, i) => {
					return c * env.dRgbInv[i];
				})
			),
			cat16Inv,
		).map(c => {
			return c / 100;
		})
	);
}
function toCam16 (xyzd65, env) {
	const xyz100 =  (
		xyzd65.map(c => {
			return c * 100;
		})
	);
	const rgbA = adapt(
		(
			multiply_v3_m3x3(xyz100, cat16).map((c, i) => {
				return c * env.dRgb[i];
			})
		),
		env.fl,
	);
	const a = rgbA[0] + (-12 * rgbA[1] + rgbA[2]) / 11;
	const b = (rgbA[0] + rgbA[1] - 2 * rgbA[2]) / 9;
	const hRad = ((Math.atan2(b, a) % tau) + tau) % tau;
	const et = 0.25 * (Math.cos(hRad + 2) + 3.8);
	const t =
		(5e4 / 13) *
		env.nc *
		env.ncb *
		zdiv(et * Math.sqrt(a ** 2 + b ** 2), rgbA[0] + rgbA[1] + 1.05 * rgbA[2] + 0.305);
	const alpha = spow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, env.n), 0.73);
	const A = env.nbb * (2 * rgbA[0] + rgbA[1] + 0.05 * rgbA[2]);
	const Jroot = spow(A / env.aW, 0.5 * env.c * env.z);
	const J = 100 * spow(Jroot, 2);
	const Q = (4 / env.c) * Jroot * (env.aW + 4) * env.flRoot;
	const C = alpha * Jroot;
	const M = C * env.flRoot;
	const h = constrain(hRad * rad2deg);
	const H = hueQuadrature(h);
	const s = 50 * spow((env.c * alpha) / (env.aW + 4), 1 / 2);
	return { J: J, C: C, h: h, s: s, Q: Q, M: M, H: H };
}
new ColorSpace({
	id: "cam16-jmh",
	cssId: "--cam16-jmh",
	name: "CAM16-JMh",
	coords: {
		j: {
			refRange: [0, 100],
			name: "J",
		},
		m: {
			refRange: [0, 105.0],
			name: "Colorfulness",
		},
		h: {
			refRange: [0, 360],
			type: "angle",
			name: "Hue",
		},
	},
	base: xyz_d65,
	fromBase (xyz) {
		if (this.ε === undefined) {
			this.ε = Object.values(this.coords)[1].refRange[1] / 100000;
		}
		const cam16 = toCam16(xyz, viewingConditions$1);
		const isAchromatic = Math.abs(cam16.M) < this.ε;
		return [cam16.J, isAchromatic ? 0 : cam16.M, isAchromatic ? null : cam16.h];
	},
	toBase (cam16) {
		return fromCam16({ J: cam16[0], M: cam16[1], h: cam16[2] }, viewingConditions$1);
	},
});

const white = WHITES.D65;
const ε = 216 / 24389;
const κ = 24389 / 27;
function toLstar (y) {
	const fy = y > ε ? Math.cbrt(y) : (κ * y + 16) / 116;
	return 116.0 * fy - 16.0;
}
function fromLstar (lstar) {
	return lstar > 8 ? Math.pow((lstar + 16) / 116, 3) : lstar / κ;
}
function fromHct (coords, env) {
	let [h, c, t] = coords;
	let xyz = [];
	let j = 0;
	if (t === 0) {
		return [0.0, 0.0, 0.0];
	}
	let y = fromLstar(t);
	if (t > 0) {
		j = 0.00379058511492914 * t ** 2 + 0.608983189401032 * t + 0.9155088574762233;
	}
	else {
		j = 9.514440756550361e-6 * t ** 2 + 0.08693057439788597 * t - 21.928975842194614;
	}
	const threshold = 2e-12;
	const max_attempts = 15;
	let attempt = 0;
	let last = Infinity;
	while (attempt <= max_attempts) {
		xyz = fromCam16({ J: j, C: c, h: h }, env);
		const delta = Math.abs(xyz[1] - y);
		if (delta < last) {
			if (delta <= threshold) {
				return xyz;
			}
			last = delta;
		}
		j = j - ((xyz[1] - y) * j) / (2 * xyz[1]);
		attempt += 1;
	}
	return fromCam16({ J: j, C: c, h: h }, env);
}
function toHct (xyz, env) {
	const t = toLstar(xyz[1]);
	if (t === 0.0) {
		return [0.0, 0.0, 0.0];
	}
	const cam16 = toCam16(xyz, viewingConditions);
	return [constrain(cam16.h), cam16.C, t];
}
const viewingConditions = environment(
	white,
	(200 / Math.PI) * fromLstar(50.0),
	fromLstar(50.0) * 100,
	"average",
	false,
);
var hct = new ColorSpace({
	id: "hct",
	name: "HCT",
	coords: {
		h: {
			refRange: [0, 360],
			type: "angle",
			name: "Hue",
		},
		c: {
			refRange: [0, 145],
			name: "Colorfulness",
		},
		t: {
			refRange: [0, 100],
			name: "Tone",
		},
	},
	base: xyz_d65,
	fromBase (xyz) {
		if (this.ε === undefined) {
			this.ε = Object.values(this.coords)[1].refRange[1] / 100000;
		}
		let hct = toHct(xyz, viewingConditions);
		if (hct[1] < this.ε) {
			hct[1] = 0.0;
			hct[0] = null;
		}
		return hct;
	},
	toBase (hct) {
		return fromHct(hct, viewingConditions);
	},
	formats: {
		color: {
			id: "--hct",
			coords: ["<number> | <angle>", "<percentage> | <number>", "<percentage> | <number>"],
		},
	},
});

const deg2rad = Math.PI / 180;
const ucsCoeff = [1.0, 0.007, 0.0228];
function convertUcsAb (coords) {
	if (coords[1] < 0) {
		coords = hct.fromBase(hct.toBase(coords));
	}
	const M =
		Math.log(Math.max(1 + ucsCoeff[2] * coords[1] * viewingConditions.flRoot, 1.0)) /
		ucsCoeff[2];
	const hrad = coords[0] * deg2rad;
	const a = M * Math.cos(hrad);
	const b = M * Math.sin(hrad);
	return [coords[2], a, b];
}
function deltaEHCT (color, sample) {
	[color, sample] = getColor([color, sample]);
	let [t1, a1, b1] = convertUcsAb(hct.from(color));
	let [t2, a2, b2] = convertUcsAb(hct.from(sample));
	return Math.sqrt((t1 - t2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

var deltaEMethods = {
	deltaE76,
	deltaECMC,
	deltaE2000,
	deltaEJz,
	deltaEITP,
	deltaEOK,
	deltaEOK2,
	deltaEHCT,
};

function calcEpsilon (jnd) {
	const order = !jnd ? 0 : Math.floor(Math.log10(Math.abs(jnd)));
	return Math.max(parseFloat(`1e${order - 2}`), 1e-6);
}
const GMAPPRESET = {
	hct: {
		method: "hct.c",
		jnd: 2,
		deltaEMethod: "hct",
		blackWhiteClamp: {},
	},
	"hct-tonal": {
		method: "hct.c",
		jnd: 0,
		deltaEMethod: "hct",
		blackWhiteClamp: { channel: "hct.t", min: 0, max: 100 },
	},
};
function toGamut (
	color,
	{
		method = defaults.gamut_mapping,
		space = undefined,
		deltaEMethod = "",
		jnd = 2,
		blackWhiteClamp = undefined,
	} = {},
) {
	color = getColor(color);
	if (isString(arguments[1])) {
		space = arguments[1];
	}
	else if (!space) {
		space = color.space;
	}
	space = ColorSpace.get(space);
	if (inGamut(color, space, { epsilon: 0 })) {
		return  (color);
	}
	let spaceColor;
	if (method === "css") {
		spaceColor = toGamutCSS(color, { space });
	}
	else {
		if (method !== "clip" && !inGamut(color, space)) {
			if (Object.prototype.hasOwnProperty.call(GMAPPRESET, method)) {
				({ method, jnd, deltaEMethod, blackWhiteClamp } = GMAPPRESET[method]);
			}
			let de = deltaE2000;
			if (deltaEMethod !== "") {
				for (let m in deltaEMethods) {
					if ("deltae" + deltaEMethod.toLowerCase() === m.toLowerCase()) {
						de = deltaEMethods[m];
						break;
					}
				}
			}
			if (jnd === 0) {
				jnd = 1e-16;
			}
			let clipped = toGamut(to(color, space), { method: "clip", space });
			if (de(color, clipped) > jnd) {
				if (blackWhiteClamp && Object.keys(blackWhiteClamp).length === 3) {
					let channelMeta = ColorSpace.resolveCoord(blackWhiteClamp.channel);
					let channel = get(to(color, channelMeta.space), channelMeta.id);
					if (isNone(channel)) {
						channel = 0;
					}
					if (channel >= blackWhiteClamp.max) {
						return to({ space: "xyz-d65", coords: WHITES["D65"] }, color.space);
					}
					else if (channel <= blackWhiteClamp.min) {
						return to({ space: "xyz-d65", coords: [0, 0, 0] }, color.space);
					}
				}
				let coordMeta = ColorSpace.resolveCoord(method);
				let mapSpace = coordMeta.space;
				let coordId = coordMeta.id;
				let mappedColor = to(color, mapSpace);
				mappedColor.coords.forEach((c, i) => {
					if (isNone(c)) {
						mappedColor.coords[i] = 0;
					}
				});
				let bounds = coordMeta.range || coordMeta.refRange;
				let min = bounds[0];
				let ε = calcEpsilon(jnd);
				let low = min;
				let high = get(mappedColor, coordId);
				while (high - low > ε) {
					let clipped = clone(mappedColor);
					clipped = toGamut(clipped, { space, method: "clip" });
					let deltaE = de(mappedColor, clipped);
					if (deltaE - jnd < ε) {
						low = get(mappedColor, coordId);
					}
					else {
						high = get(mappedColor, coordId);
					}
					set(mappedColor, coordId, (low + high) / 2);
				}
				spaceColor = to(mappedColor, space);
			}
			else {
				spaceColor = clipped;
			}
		}
		else {
			spaceColor = to(color, space);
		}
		if (
			method === "clip" ||
			!inGamut(spaceColor, space, { epsilon: 0 })
		) {
			let bounds = Object.values(space.coords).map(c => c.range || []);
			spaceColor.coords =  (
				spaceColor.coords.map((c, i) => {
					let [min, max] = bounds[i];
					if (min !== undefined) {
						c = Math.max(min, c);
					}
					if (max !== undefined) {
						c = Math.min(c, max);
					}
					return c;
				})
			);
		}
	}
	if (space !== color.space) {
		spaceColor = to(spaceColor, color.space);
	}
	color.coords = spaceColor.coords;
	return  (color);
}
toGamut.returns = "color";
const COLORS = {
	WHITE: { space: Oklab, coords: [1, 0, 0], alpha: 1 },
	BLACK: { space: Oklab, coords: [0, 0, 0], alpha: 1 },
};
function toGamutCSS (origin, { space } = {}) {
	const JND = 0.02;
	const ε = 0.0001;
	origin = getColor(origin);
	if (!space) {
		space = origin.space;
	}
	space = ColorSpace.get(space);
	const oklchSpace = ColorSpace.get("oklch");
	if (space.isUnbounded) {
		return to(origin, space);
	}
	const origin_OKLCH = to(origin, oklchSpace);
	let L = origin_OKLCH.coords[0];
	if (L >= 1) {
		const white = to(COLORS.WHITE, space);
		white.alpha = origin.alpha;
		return to(white, space);
	}
	if (L <= 0) {
		const black = to(COLORS.BLACK, space);
		black.alpha = origin.alpha;
		return to(black, space);
	}
	if (inGamut(origin_OKLCH, space, { epsilon: 0 })) {
		return to(origin_OKLCH, space);
	}
	function clip (_color) {
		const destColor = to(_color, space);
		const spaceCoords = Object.values( (space).coords);
		destColor.coords =  (
			destColor.coords.map((coord, index) => {
				if ("range" in spaceCoords[index]) {
					const [min, max] = spaceCoords[index].range;
					return clamp$1(min, coord, max);
				}
				return coord;
			})
		);
		return destColor;
	}
	let min = 0;
	let max = origin_OKLCH.coords[1];
	let min_inGamut = true;
	let current = clone(origin_OKLCH);
	let clipped = clip(current);
	let E = deltaEOK(clipped, current);
	if (E < JND) {
		return clipped;
	}
	while (max - min > ε) {
		const chroma = (min + max) / 2;
		current.coords[1] = chroma;
		if (min_inGamut && inGamut(current, space, { epsilon: 0 })) {
			min = chroma;
		}
		else {
			clipped = clip(current);
			E = deltaEOK(clipped, current);
			if (E < JND) {
				if (JND - E < ε) {
					break;
				}
				else {
					min_inGamut = false;
					min = chroma;
				}
			}
			else {
				max = chroma;
			}
		}
	}
	return clipped;
}

function to (color, space, { inGamut } = {}) {
	color = getColor(color);
	space = ColorSpace.get(space);
	let coords = space.from(color);
	let ret = { space, coords, alpha: color.alpha };
	if (inGamut) {
		ret = toGamut(ret, inGamut === true ? undefined : inGamut);
	}
	return ret;
}
to.returns = "color";

function serialize (color, options = {}) {
	let {
		precision = defaults.precision,
		format,
		inGamut: inGamut$1 = true,
		coords: coordFormat,
		alpha: alphaFormat,
		commas,
	} = options;
	let ret;
	let colorWithMeta =  (getColor(color));
	let formatId = format;
	let parseMeta = colorWithMeta.parseMeta;
	if (parseMeta && !format) {
		if (parseMeta.format.canSerialize()) {
			format = parseMeta.format;
			formatId = parseMeta.formatId;
		}
		coordFormat ??= parseMeta.types;
		alphaFormat ??= parseMeta.alphaType;
		commas ??= parseMeta.commas;
	}
	if (formatId) {
		format = colorWithMeta.space.getFormat(format) ?? ColorSpace.findFormat(formatId);
	}
	if (!format) {
		format = colorWithMeta.space.getFormat("default") ?? ColorSpace.DEFAULT_FORMAT;
		formatId = format.name;
	}
	if (format && format.space && format.space !== colorWithMeta.space) {
		colorWithMeta = to(colorWithMeta, format.space);
	}
	let coords = colorWithMeta.coords.slice();
	inGamut$1 ||= format.toGamut;
	if (inGamut$1 && !inGamut(colorWithMeta)) {
		coords = toGamut(clone(colorWithMeta), inGamut$1 === true ? undefined : inGamut$1).coords;
	}
	if (format.type === "custom") {
		if (format.serialize) {
			ret = format.serialize(coords, colorWithMeta.alpha, options);
		}
		else {
			throw new TypeError(
				`format ${formatId} can only be used to parse colors, not for serialization`,
			);
		}
	}
	else {
		let name = format.name || "color";
		let args = format.serializeCoords(coords, precision, coordFormat);
		if (name === "color") {
			let cssId =
				format.id || format.ids?.[0] || colorWithMeta.space.cssId || colorWithMeta.space.id;
			args.unshift(cssId);
		}
		let alpha = colorWithMeta.alpha;
		if (alphaFormat !== undefined && !(typeof alphaFormat === "object")) {
			alphaFormat =
				typeof alphaFormat === "string" ? { type: alphaFormat } : { include: alphaFormat };
		}
		let alphaType = alphaFormat?.type ?? "<number>";
		let serializeAlpha =
			alphaFormat?.include === true ||
			format.alpha === true ||
			(alphaFormat?.include !== false && format.alpha !== false && alpha < 1);
		let strAlpha = "";
		commas ??= format.commas;
		if (serializeAlpha) {
			if (precision !== null) {
				let unit;
				if (alphaType === "<percentage>") {
					unit = "%";
					alpha *= 100;
				}
				alpha = serializeNumber(alpha, { precision, unit });
			}
			strAlpha = `${commas ? "," : " /"} ${alpha}`;
		}
		ret = `${name}(${args.join(commas ? ", " : " ")}${strAlpha})`;
	}
	return ret;
}

const toXYZ_M$4 = [
	[ 0.6369580483012914, 0.14461690358620832,  0.1688809751641721  ],
	[ 0.2627002120112671, 0.6779980715188708,   0.05930171646986196 ],
	[ 0.000000000000000,  0.028072693049087428, 1.060985057710791   ],
];
const fromXYZ_M$4 = [
	[  1.716651187971268,  -0.355670783776392, -0.253366281373660  ],
	[ -0.666684351832489,   1.616481236634939,  0.0157685458139111 ],
	[  0.017639857445311,  -0.042770613257809,  0.942103121235474  ],
];
var REC_2020_Linear = new RGBColorSpace({
	id: "rec2020-linear",
	cssId: "--rec2020-linear",
	name: "Linear REC.2020",
	white: "D65",
	toXYZ_M: toXYZ_M$4,
	fromXYZ_M: fromXYZ_M$4,
});

var REC2020 = new RGBColorSpace({
	id: "rec2020",
	name: "REC.2020",
	base: REC_2020_Linear,
	toBase (RGB) {
		return RGB.map(function (val) {
			let sign = val < 0 ? -1 : 1;
			let abs = val * sign;
			return sign * Math.pow(abs, 2.4);
		});
	},
	fromBase (RGB) {
		return RGB.map(function (val) {
			let sign = val < 0 ? -1 : 1;
			let abs = val * sign;
			return sign * Math.pow(abs, 1 / 2.4);
		});
	},
});

const toXYZ_M$3 = [
	[0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
	[0.2289745640697488, 0.6917385218365064,  0.079286914093745],
	[0.0000000000000000, 0.04511338185890264, 1.043944368900976],
];
const fromXYZ_M$3 = [
	[ 2.493496911941425,   -0.9313836179191239, -0.40271078445071684],
	[-0.8294889695615747,   1.7626640603183463,  0.023624685841943577],
	[ 0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
];
var P3Linear = new RGBColorSpace({
	id: "p3-linear",
	cssId: "display-p3-linear",
	name: "Linear P3",
	white: "D65",
	toXYZ_M: toXYZ_M$3,
	fromXYZ_M: fromXYZ_M$3,
});

const toXYZ_M$2 = [
	[ 0.41239079926595934, 0.357584339383878,   0.1804807884018343  ],
	[ 0.21263900587151027, 0.715168678767756,   0.07219231536073371 ],
	[ 0.01933081871559182, 0.11919477979462598, 0.9505321522496607  ],
];
const fromXYZ_M$2 = [
	[  3.2409699419045226,  -1.537383177570094,   -0.4986107602930034  ],
	[ -0.9692436362808796,   1.8759675015077202,   0.04155505740717559 ],
	[  0.05563007969699366, -0.20397695888897652,  1.0569715142428786  ],
];
var sRGBLinear = new RGBColorSpace({
	id: "srgb-linear",
	name: "Linear sRGB",
	white: "D65",
	toXYZ_M: toXYZ_M$2,
	fromXYZ_M: fromXYZ_M$2,
});

var KEYWORDS = {
	aliceblue: [240 / 255, 248 / 255, 1],
	antiquewhite: [250 / 255, 235 / 255, 215 / 255],
	aqua: [0, 1, 1],
	aquamarine: [127 / 255, 1, 212 / 255],
	azure: [240 / 255, 1, 1],
	beige: [245 / 255, 245 / 255, 220 / 255],
	bisque: [1, 228 / 255, 196 / 255],
	black: [0, 0, 0],
	blanchedalmond: [1, 235 / 255, 205 / 255],
	blue: [0, 0, 1],
	blueviolet: [138 / 255, 43 / 255, 226 / 255],
	brown: [165 / 255, 42 / 255, 42 / 255],
	burlywood: [222 / 255, 184 / 255, 135 / 255],
	cadetblue: [95 / 255, 158 / 255, 160 / 255],
	chartreuse: [127 / 255, 1, 0],
	chocolate: [210 / 255, 105 / 255, 30 / 255],
	coral: [1, 127 / 255, 80 / 255],
	cornflowerblue: [100 / 255, 149 / 255, 237 / 255],
	cornsilk: [1, 248 / 255, 220 / 255],
	crimson: [220 / 255, 20 / 255, 60 / 255],
	cyan: [0, 1, 1],
	darkblue: [0, 0, 139 / 255],
	darkcyan: [0, 139 / 255, 139 / 255],
	darkgoldenrod: [184 / 255, 134 / 255, 11 / 255],
	darkgray: [169 / 255, 169 / 255, 169 / 255],
	darkgreen: [0, 100 / 255, 0],
	darkgrey: [169 / 255, 169 / 255, 169 / 255],
	darkkhaki: [189 / 255, 183 / 255, 107 / 255],
	darkmagenta: [139 / 255, 0, 139 / 255],
	darkolivegreen: [85 / 255, 107 / 255, 47 / 255],
	darkorange: [1, 140 / 255, 0],
	darkorchid: [153 / 255, 50 / 255, 204 / 255],
	darkred: [139 / 255, 0, 0],
	darksalmon: [233 / 255, 150 / 255, 122 / 255],
	darkseagreen: [143 / 255, 188 / 255, 143 / 255],
	darkslateblue: [72 / 255, 61 / 255, 139 / 255],
	darkslategray: [47 / 255, 79 / 255, 79 / 255],
	darkslategrey: [47 / 255, 79 / 255, 79 / 255],
	darkturquoise: [0, 206 / 255, 209 / 255],
	darkviolet: [148 / 255, 0, 211 / 255],
	deeppink: [1, 20 / 255, 147 / 255],
	deepskyblue: [0, 191 / 255, 1],
	dimgray: [105 / 255, 105 / 255, 105 / 255],
	dimgrey: [105 / 255, 105 / 255, 105 / 255],
	dodgerblue: [30 / 255, 144 / 255, 1],
	firebrick: [178 / 255, 34 / 255, 34 / 255],
	floralwhite: [1, 250 / 255, 240 / 255],
	forestgreen: [34 / 255, 139 / 255, 34 / 255],
	fuchsia: [1, 0, 1],
	gainsboro: [220 / 255, 220 / 255, 220 / 255],
	ghostwhite: [248 / 255, 248 / 255, 1],
	gold: [1, 215 / 255, 0],
	goldenrod: [218 / 255, 165 / 255, 32 / 255],
	gray: [128 / 255, 128 / 255, 128 / 255],
	green: [0, 128 / 255, 0],
	greenyellow: [173 / 255, 1, 47 / 255],
	grey: [128 / 255, 128 / 255, 128 / 255],
	honeydew: [240 / 255, 1, 240 / 255],
	hotpink: [1, 105 / 255, 180 / 255],
	indianred: [205 / 255, 92 / 255, 92 / 255],
	indigo: [75 / 255, 0, 130 / 255],
	ivory: [1, 1, 240 / 255],
	khaki: [240 / 255, 230 / 255, 140 / 255],
	lavender: [230 / 255, 230 / 255, 250 / 255],
	lavenderblush: [1, 240 / 255, 245 / 255],
	lawngreen: [124 / 255, 252 / 255, 0],
	lemonchiffon: [1, 250 / 255, 205 / 255],
	lightblue: [173 / 255, 216 / 255, 230 / 255],
	lightcoral: [240 / 255, 128 / 255, 128 / 255],
	lightcyan: [224 / 255, 1, 1],
	lightgoldenrodyellow: [250 / 255, 250 / 255, 210 / 255],
	lightgray: [211 / 255, 211 / 255, 211 / 255],
	lightgreen: [144 / 255, 238 / 255, 144 / 255],
	lightgrey: [211 / 255, 211 / 255, 211 / 255],
	lightpink: [1, 182 / 255, 193 / 255],
	lightsalmon: [1, 160 / 255, 122 / 255],
	lightseagreen: [32 / 255, 178 / 255, 170 / 255],
	lightskyblue: [135 / 255, 206 / 255, 250 / 255],
	lightslategray: [119 / 255, 136 / 255, 153 / 255],
	lightslategrey: [119 / 255, 136 / 255, 153 / 255],
	lightsteelblue: [176 / 255, 196 / 255, 222 / 255],
	lightyellow: [1, 1, 224 / 255],
	lime: [0, 1, 0],
	limegreen: [50 / 255, 205 / 255, 50 / 255],
	linen: [250 / 255, 240 / 255, 230 / 255],
	magenta: [1, 0, 1],
	maroon: [128 / 255, 0, 0],
	mediumaquamarine: [102 / 255, 205 / 255, 170 / 255],
	mediumblue: [0, 0, 205 / 255],
	mediumorchid: [186 / 255, 85 / 255, 211 / 255],
	mediumpurple: [147 / 255, 112 / 255, 219 / 255],
	mediumseagreen: [60 / 255, 179 / 255, 113 / 255],
	mediumslateblue: [123 / 255, 104 / 255, 238 / 255],
	mediumspringgreen: [0, 250 / 255, 154 / 255],
	mediumturquoise: [72 / 255, 209 / 255, 204 / 255],
	mediumvioletred: [199 / 255, 21 / 255, 133 / 255],
	midnightblue: [25 / 255, 25 / 255, 112 / 255],
	mintcream: [245 / 255, 1, 250 / 255],
	mistyrose: [1, 228 / 255, 225 / 255],
	moccasin: [1, 228 / 255, 181 / 255],
	navajowhite: [1, 222 / 255, 173 / 255],
	navy: [0, 0, 128 / 255],
	oldlace: [253 / 255, 245 / 255, 230 / 255],
	olive: [128 / 255, 128 / 255, 0],
	olivedrab: [107 / 255, 142 / 255, 35 / 255],
	orange: [1, 165 / 255, 0],
	orangered: [1, 69 / 255, 0],
	orchid: [218 / 255, 112 / 255, 214 / 255],
	palegoldenrod: [238 / 255, 232 / 255, 170 / 255],
	palegreen: [152 / 255, 251 / 255, 152 / 255],
	paleturquoise: [175 / 255, 238 / 255, 238 / 255],
	palevioletred: [219 / 255, 112 / 255, 147 / 255],
	papayawhip: [1, 239 / 255, 213 / 255],
	peachpuff: [1, 218 / 255, 185 / 255],
	peru: [205 / 255, 133 / 255, 63 / 255],
	pink: [1, 192 / 255, 203 / 255],
	plum: [221 / 255, 160 / 255, 221 / 255],
	powderblue: [176 / 255, 224 / 255, 230 / 255],
	purple: [128 / 255, 0, 128 / 255],
	rebeccapurple: [102 / 255, 51 / 255, 153 / 255],
	red: [1, 0, 0],
	rosybrown: [188 / 255, 143 / 255, 143 / 255],
	royalblue: [65 / 255, 105 / 255, 225 / 255],
	saddlebrown: [139 / 255, 69 / 255, 19 / 255],
	salmon: [250 / 255, 128 / 255, 114 / 255],
	sandybrown: [244 / 255, 164 / 255, 96 / 255],
	seagreen: [46 / 255, 139 / 255, 87 / 255],
	seashell: [1, 245 / 255, 238 / 255],
	sienna: [160 / 255, 82 / 255, 45 / 255],
	silver: [192 / 255, 192 / 255, 192 / 255],
	skyblue: [135 / 255, 206 / 255, 235 / 255],
	slateblue: [106 / 255, 90 / 255, 205 / 255],
	slategray: [112 / 255, 128 / 255, 144 / 255],
	slategrey: [112 / 255, 128 / 255, 144 / 255],
	snow: [1, 250 / 255, 250 / 255],
	springgreen: [0, 1, 127 / 255],
	steelblue: [70 / 255, 130 / 255, 180 / 255],
	tan: [210 / 255, 180 / 255, 140 / 255],
	teal: [0, 128 / 255, 128 / 255],
	thistle: [216 / 255, 191 / 255, 216 / 255],
	tomato: [1, 99 / 255, 71 / 255],
	turquoise: [64 / 255, 224 / 255, 208 / 255],
	violet: [238 / 255, 130 / 255, 238 / 255],
	wheat: [245 / 255, 222 / 255, 179 / 255],
	white: [1, 1, 1],
	whitesmoke: [245 / 255, 245 / 255, 245 / 255],
	yellow: [1, 1, 0],
	yellowgreen: [154 / 255, 205 / 255, 50 / 255],
};

let coordGrammar = Array(3).fill("<percentage> | <number>[0, 255]");
let coordGrammarNumber = Array(3).fill("<number>[0, 255]");
var sRGB = new RGBColorSpace({
	id: "srgb",
	name: "sRGB",
	base: sRGBLinear,
	fromBase: rgb => {
		return rgb.map(val => {
			let sign = val < 0 ? -1 : 1;
			let abs = val * sign;
			if (abs > 0.0031308) {
				return sign * (1.055 * abs ** (1 / 2.4) - 0.055);
			}
			return 12.92 * val;
		});
	},
	toBase: rgb => {
		return rgb.map(val => {
			let sign = val < 0 ? -1 : 1;
			let abs = val * sign;
			if (abs <= 0.04045) {
				return val / 12.92;
			}
			return sign * ((abs + 0.055) / 1.055) ** 2.4;
		});
	},
	formats: {
		rgb: {
			coords: coordGrammar,
		},
		rgb_number: {
			name: "rgb",
			commas: true,
			coords: coordGrammarNumber,
			alpha: false,
		},
		color: {
		},
		rgba: {
			coords: coordGrammar,
			commas: true,
			alpha: true,
		},
		rgba_number: {
			name: "rgba",
			commas: true,
			coords: coordGrammarNumber,
		},
		hex: {
			type: "custom",
			toGamut: true,
			test: str => /^#(([a-f0-9]{2}){3,4}|[a-f0-9]{3,4})$/i.test(str),
			parse (str) {
				if (str.length <= 5) {
					str = str.replace(/[a-f0-9]/gi, "$&$&");
				}
				let rgba = [];
				str.replace(/[a-f0-9]{2}/gi, component => {
					rgba.push(parseInt(component, 16) / 255);
				});
				return {
					spaceId: "srgb",
					coords:  (rgba.slice(0, 3)),
					alpha:  (rgba.slice(3)[0]),
				};
			},
			serialize: (
				coords,
				alpha,
				{
					collapse = true,
					alpha: alphaFormat,
				} = {},
			) => {
				if ((alphaFormat !== false && alpha < 1) || alphaFormat === true) {
					coords.push(alpha);
				}
				coords =  (
					coords.map(c => Math.round(c * 255))
				);
				let collapsible = collapse && coords.every(c => c % 17 === 0);
				let hex = coords
					.map(c => {
						if (collapsible) {
							return (c / 17).toString(16);
						}
						return c.toString(16).padStart(2, "0");
					})
					.join("");
				return "#" + hex;
			},
		},
		keyword: {
			type: "custom",
			test: str => /^[a-z]+$/i.test(str),
			parse (str) {
				str = str.toLowerCase();
				let ret = { spaceId: "srgb", coords: null, alpha: 1 };
				if (str === "transparent") {
					ret.coords = KEYWORDS.black;
					ret.alpha = 0;
				}
				else {
					ret.coords = KEYWORDS[str];
				}
				if (ret.coords) {
					return ret;
				}
			},
		},
	},
});

var P3 = new RGBColorSpace({
	id: "p3",
	cssId: "display-p3",
	name: "P3",
	base: P3Linear,
	fromBase: sRGB.fromBase,
	toBase: sRGB.toBase,
});

var hsl = new ColorSpace({
	id: "hsl",
	name: "HSL",
	coords: {
		h: {
			refRange: [0, 360],
			type: "angle",
			name: "Hue",
		},
		s: {
			range: [0, 100],
			name: "Saturation",
		},
		l: {
			range: [0, 100],
			name: "Lightness",
		},
	},
	base: sRGB,
	fromBase: rgb => {
		let max = Math.max(...rgb);
		let min = Math.min(...rgb);
		let [r, g, b] = rgb;
		let [h, s, l] = [null, 0, (min + max) / 2];
		let d = max - min;
		if (d !== 0) {
			s = l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);
			switch (max) {
				case r:
					h = (g - b) / d + (g < b ? 6 : 0);
					break;
				case g:
					h = (b - r) / d + 2;
					break;
				case b:
					h = (r - g) / d + 4;
			}
			h = h * 60;
		}
		if (s < 0) {
			h += 180;
			s = Math.abs(s);
		}
		if (h >= 360) {
			h -= 360;
		}
		return [h, s * 100, l * 100];
	},
	toBase: hsl => {
		let [h, s, l] = hsl;
		h = h % 360;
		if (h < 0) {
			h += 360;
		}
		s /= 100;
		l /= 100;
		function f (n) {
			let k = (n + h / 30) % 12;
			let a = s * Math.min(l, 1 - l);
			return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		}
		return [f(0), f(8), f(4)];
	},
	formats: {
		hsl: {
			coords: ["<number> | <angle>", "<percentage> | <number>", "<percentage> | <number>"],
		},
		hsla: {
			coords: ["<number> | <angle>", "<percentage> | <number>", "<percentage> | <number>"],
			commas: true,
			alpha: true,
		},
	},
});

var HSV = new ColorSpace({
	id: "hsv",
	name: "HSV",
	coords: {
		h: {
			refRange: [0, 360],
			type: "angle",
			name: "Hue",
		},
		s: {
			range: [0, 100],
			name: "Saturation",
		},
		v: {
			range: [0, 100],
			name: "Value",
		},
	},
	base: sRGB,
	fromBase (rgb) {
		let max = Math.max(...rgb);
		let min = Math.min(...rgb);
		let [r, g, b] = rgb;
		let [h, s, v] = [null, 0, max];
		let d = max - min;
		if (d !== 0) {
			switch (max) {
				case r:
					h = (g - b) / d + (g < b ? 6 : 0);
					break;
				case g:
					h = (b - r) / d + 2;
					break;
				case b:
					h = (r - g) / d + 4;
			}
			h = h * 60;
		}
		if (v) {
			s = d / v;
		}
		if (h >= 360) {
			h -= 360;
		}
		return [h, s * 100, v * 100];
	},
	toBase (hsv) {
		let [h, s, v] = hsv;
		h = h % 360;
		if (h < 0) {
			h += 360;
		}
		s /= 100;
		v /= 100;
		function f (n) {
			let k = (n + h / 60) % 6;
			return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
		}
		return [f(5), f(3), f(1)];
	},
	formats: {
		color: {
			id: "--hsv",
			coords: ["<number> | <angle>", "<percentage> | <number>", "<percentage> | <number>"],
		},
	},
});

var hwb = new ColorSpace({
	id: "hwb",
	name: "HWB",
	coords: {
		h: {
			refRange: [0, 360],
			type: "angle",
			name: "Hue",
		},
		w: {
			range: [0, 100],
			name: "Whiteness",
		},
		b: {
			range: [0, 100],
			name: "Blackness",
		},
	},
	base: HSV,
	fromBase (hsv) {
		let [h, s, v] = hsv;
		return [h, (v * (100 - s)) / 100, 100 - v];
	},
	toBase (hwb) {
		let [h, w, b] = hwb;
		w /= 100;
		b /= 100;
		let sum = w + b;
		if (sum >= 1) {
			let gray = w / sum;
			return [h, 0, gray * 100];
		}
		let v = 1 - b;
		let s = v === 0 ? 0 : 1 - w / v;
		return [h, s * 100, v * 100];
	},
	formats: {
		hwb: {
			coords: ["<number> | <angle>", "<percentage> | <number>", "<percentage> | <number>"],
		},
	},
});

const toXYZ_M$1 = [
	[ 0.5766690429101305,   0.1855582379065463,   0.1882286462349947  ],
	[ 0.29734497525053605,  0.6273635662554661,   0.07529145849399788 ],
	[ 0.02703136138641234,  0.07068885253582723,  0.9913375368376388  ],
];
const fromXYZ_M$1 = [
	[  2.0415879038107465,    -0.5650069742788596,   -0.34473135077832956 ],
	[ -0.9692436362808795,     1.8759675015077202,    0.04155505740717557 ],
	[  0.013444280632031142,  -0.11836239223101838,   1.0151749943912054  ],
];
var A98Linear = new RGBColorSpace({
	id: "a98rgb-linear",
	cssId: "--a98-rgb-linear",
	name: "Linear Adobe® 98 RGB compatible",
	white: "D65",
	toXYZ_M: toXYZ_M$1,
	fromXYZ_M: fromXYZ_M$1,
});

var a98rgb = new RGBColorSpace({
	id: "a98rgb",
	cssId: "a98-rgb",
	name: "Adobe® 98 RGB compatible",
	base: A98Linear,
	toBase: RGB => RGB.map(val => Math.pow(Math.abs(val), 563 / 256) * Math.sign(val)),
	fromBase: RGB => RGB.map(val => Math.pow(Math.abs(val), 256 / 563) * Math.sign(val)),
});

const toXYZ_M = [
	[ 0.79776664490064230,  0.13518129740053308,  0.03134773412839220 ],
	[ 0.28807482881940130,  0.71183523424187300,  0.00008993693872564 ],
	[ 0.00000000000000000,  0.00000000000000000,  0.82510460251046020 ],
];
const fromXYZ_M = [
	[  1.34578688164715830, -0.25557208737979464, -0.05110186497554526 ],
	[ -0.54463070512490190,  1.50824774284514680,  0.02052744743642139 ],
	[  0.00000000000000000,  0.00000000000000000,  1.21196754563894520 ],
];
var ProPhotoLinear = new RGBColorSpace({
	id: "prophoto-linear",
	cssId: "--prophoto-rgb-linear",
	name: "Linear ProPhoto",
	white: "D50",
	base: XYZ_D50,
	toXYZ_M,
	fromXYZ_M,
});

const Et = 1 / 512;
const Et2 = 16 / 512;
var prophoto = new RGBColorSpace({
	id: "prophoto",
	cssId: "prophoto-rgb",
	name: "ProPhoto",
	base: ProPhotoLinear,
	toBase (RGB) {
		return RGB.map(v => {
			let sign = v < 0 ? -1 : 1;
			let abs = v * sign;
			if (abs < Et2) {
				return v / 16;
			}
			return sign * abs ** 1.8;
		});
	},
	fromBase (RGB) {
		return RGB.map(v => {
			let sign = v < 0 ? -1 : 1;
			let abs = v * sign;
			if (abs >= Et) {
				return sign * abs ** (1 / 1.8);
			}
			return 16 * v;
		});
	},
});

var oklch = new ColorSpace({
	id: "oklch",
	name: "OkLCh",
	coords: {
		l: {
			refRange: [0, 1],
			name: "Lightness",
		},
		c: {
			refRange: [0, 0.4],
			name: "Chroma",
		},
		h: {
			refRange: [0, 360],
			type: "angle",
			name: "Hue",
		},
	},
	white: "D65",
	base: Oklab,
	fromBase: lch.fromBase,
	toBase: lch.toBase,
	formats: {
		oklch: {
			coords: ["<percentage> | <number>", "<number> | <percentage>", "<number> | <angle>"],
		},
	},
});

/*
 * Registers the colorjs.io colour spaces the picker parses and converts between
 * (sRGB, OKLCH, OKLab, LCH, Lab, HSL, HWB, P3, Rec2020, ProPhoto, A98, XYZ).
 * Imported for its side-effect by the model and the area-compute module.
 * Space list adapted from Adam Argyle's color-input (MIT).
 */
ColorSpace.register(sRGB);
ColorSpace.register(sRGBLinear);
ColorSpace.register(hsl);
ColorSpace.register(hwb);
ColorSpace.register(lab);
ColorSpace.register(lch);
ColorSpace.register(Oklab);
ColorSpace.register(oklch);
ColorSpace.register(P3);
ColorSpace.register(a98rgb);
ColorSpace.register(prophoto);
ColorSpace.register(REC2020);
ColorSpace.register(xyz_d65);
ColorSpace.register(XYZ_D50);

/*
 * Internal colour model for the OKLCH plugin — a thin immutable wrapper over
 * colorjs.io/fn.
 *
 * Canonical representation is OKLCH: it is the picker's working space and is
 * lossless across sRGB / Display-P3 / Rec2020, so dragging into the wide-gamut
 * region of the area picker never clips mid-edit. The binding's *source format*
 * (hex / rgb() / oklch() / color(display-p3 …) …) is remembered so values
 * round-trip in whatever shape the user supplied, and the verbatim source string
 * is returned unchanged until the colour is actually edited.
 */
// Dropdown order: everyday sRGB/CSS formats first, then perceptual, then
// wide-gamut — familiar-first, matching Figma / DevTools conventions.
const EDIT_MODES = [
    'hex',
    'srgb',
    'css',
    'hsl',
    'hwb',
    'oklch',
    'oklab',
    'lch',
    'lab',
    'p3',
    'rec2020',
];
/** Modes whose space only covers sRGB: switching into one snaps a wider-gamut
 *  colour into sRGB so its channels stay meaningful. The perceptual (OKLCH /
 *  OKLab / LCH / Lab) and wide-RGB (P3 / Rec2020) modes keep the full colour. */
const SRGB_BOUND_MODES = ['srgb', 'css', 'hsl', 'hwb', 'hex'];
/** Whether the area draws the sRGB gamut boundary in this mode: shown for every
 *  mode whose space can exceed sRGB, hidden for the sRGB-bound ones (where the
 *  whole plane is reachable, so the line carries no information). */
function showsGamutBoundary(mode) {
    return !SRGB_BOUND_MODES.includes(mode);
}
/** Hard cap on OKLCH chroma. Beyond any real display gamut (ProPhoto tops out
 *  near 0.49), so it rejects nonsense input (e.g. a typed chroma of 40000)
 *  without ever clipping a colour that could actually be shown. */
const MAX_CHROMA = 0.5;
const MODE_LABELS = {
    oklch: 'OKLCH',
    oklab: 'OKLab',
    lch: 'LCH',
    lab: 'Lab',
    srgb: 'RGB',
    css: 'CSS',
    hsl: 'HSL',
    hwb: 'HWB',
    hex: 'HEX',
    p3: 'P3',
    rec2020: 'Rec2020',
};
/** colorjs.io space id backing an edit mode (hex + css share the sRGB space). */
function modeSpaceId(mode) {
    return mode === 'hex' || mode === 'css' ? 'srgb' : mode;
}
/**
 * Per-mode channel descriptors, in display units that match CSS Color 4 /
 * oklch.com / DevTools conventions (`display = coord * scale`):
 * - OKLCH: L 0–100, C 0–0.5, H 0–360       · OKLab: L 0–100, a/b ±0.4
 * - LCH:   L 0–100, C 0–150, H 0–360        · Lab:   L 0–100, a/b ±125
 * - RGB:   R/G/B 0–255 (integers)           · HSL:   H 0–360, S/L 0–100
 * - HWB:   H 0–360, W/B 0–100               · P3 / Rec2020: R/G/B 0–1
 * (HEX has no numeric channels — it uses a single text field.)
 */
const MODE_CHANNELS = {
    oklch: [
        { key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 100 },
        { key: 'c', label: 'C', min: 0, max: MAX_CHROMA, step: 0.01, scale: 1 },
        { key: 'h', label: 'H', min: 0, max: 360, step: 1, scale: 1 },
    ],
    oklab: [
        { key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 100 },
        { key: 'a', label: 'a', min: -0.4, max: 0.4, step: 0.01, scale: 1 },
        { key: 'b', label: 'b', min: -0.4, max: 0.4, step: 0.01, scale: 1 },
    ],
    lch: [
        { key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 1 },
        { key: 'c', label: 'C', min: 0, max: 150, step: 1, scale: 1 },
        { key: 'h', label: 'H', min: 0, max: 360, step: 1, scale: 1 },
    ],
    lab: [
        { key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 1 },
        { key: 'a', label: 'a', min: -125, max: 125, step: 1, scale: 1 },
        { key: 'b', label: 'b', min: -125, max: 125, step: 1, scale: 1 },
    ],
    srgb: [
        { key: 'r', label: 'R', min: 0, max: 255, step: 1, scale: 255 },
        { key: 'g', label: 'G', min: 0, max: 255, step: 1, scale: 255 },
        { key: 'b', label: 'B', min: 0, max: 255, step: 1, scale: 255 },
    ],
    // CSS mode = sRGB channels, output as legacy `rgba(r, g, b, a)`.
    css: [
        { key: 'r', label: 'R', min: 0, max: 255, step: 1, scale: 255 },
        { key: 'g', label: 'G', min: 0, max: 255, step: 1, scale: 255 },
        { key: 'b', label: 'B', min: 0, max: 255, step: 1, scale: 255 },
    ],
    hsl: [
        { key: 'h', label: 'H', min: 0, max: 360, step: 1, scale: 1 },
        { key: 's', label: 'S', min: 0, max: 100, step: 1, scale: 1 },
        { key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 1 },
    ],
    hwb: [
        { key: 'h', label: 'H', min: 0, max: 360, step: 1, scale: 1 },
        { key: 'w', label: 'W', min: 0, max: 100, step: 1, scale: 1 },
        { key: 'b', label: 'B', min: 0, max: 100, step: 1, scale: 1 },
    ],
    p3: [
        { key: 'r', label: 'R', min: 0, max: 1, step: 0.01, scale: 1 },
        { key: 'g', label: 'G', min: 0, max: 1, step: 0.01, scale: 1 },
        { key: 'b', label: 'B', min: 0, max: 1, step: 0.01, scale: 1 },
    ],
    rec2020: [
        { key: 'r', label: 'R', min: 0, max: 1, step: 0.01, scale: 1 },
        { key: 'g', label: 'G', min: 0, max: 1, step: 0.01, scale: 1 },
        { key: 'b', label: 'B', min: 0, max: 1, step: 0.01, scale: 1 },
    ],
};
/** Decimal places a channel is displayed at, from its step — shared by the open
 *  numeric inputs and the collapsed readout so they round identically. */
function digitsFor(step) {
    return step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
}
/** Coalesce null / NaN (e.g. a powerless OKLCH hue on a grey) to 0. */
function num(x) {
    return x == null || Number.isNaN(x) ? 0 : x;
}
function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
}
/** Does colorjs accept this exact string as a colour? */
function parses(s) {
    try {
        getColor(parse(s));
        return true;
    }
    catch {
        return false;
    }
}
/** First embedded colour token (a hex literal or a colour function) in text. */
const COLOR_TOKEN = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b|(?:rgba?|hsla?|hwb|(?:ok)?lab|(?:ok)?lch|color)\([^)]*\)/i;
/**
 * Recover a colour from a messy paste, the way a good colour input should. The
 * caller has already tried a straight parse; here we strip CSS-declaration noise
 * — a leading `prop:`, a trailing `;`/`,`/`!important`, wrapping quotes — and,
 * failing that, pull the first colour token out of the surrounding text (so
 * `color: #ff0000;`, `"#ff0000"`, `rgb(0 0 0) !important`, even
 * `var(--x, #ff0000)` resolve). Returns null when nothing parseable is found.
 */
function extractColorString(trimmed) {
    const stripped = trimmed
        .replace(/^[a-z-]+\s*:\s*/i, '') // leading CSS property name
        .replace(/\s*!important\s*$/i, '') // !important flag
        .replace(/[;,]+\s*$/, '') // trailing ; or ,
        .replace(/^["'`]+|["'`]+$/g, '') // wrapping quotes / backticks
        .trim();
    if (stripped !== trimmed && parses(stripped)) {
        return stripped;
    }
    const token = COLOR_TOKEN.exec(trimmed)?.[0];
    return token && parses(token) ? token : null;
}
class OklchColor {
    /** Canonical OKLCH coords: [L 0..1, C 0..~0.4, H 0..360]. */
    coords;
    alpha;
    format;
    /** Verbatim source string; returned by `serialize()` until edited (then null). */
    source;
    constructor(coords, alpha, format, source) {
        // Clamp to sane bounds at the single construction choke point, so typed or
        // parsed nonsense (e.g. a chroma of 40000 in the colour text field) can't
        // take hold. Every real colour already sits inside these.
        this.coords = [
            clamp(coords[0], 0, 1),
            clamp(coords[1], 0, MAX_CHROMA),
            clamp(coords[2], 0, 360),
        ];
        this.alpha = clamp(alpha, 0, 1);
        this.format = format;
        this.source = source;
    }
    /** A copy marked as edited: drops the verbatim `source` string so `serialize()`
     *  recomputes from the (clamped) coords. Used when the colour text field is
     *  typed into, so an out-of-range entry shows as its clamped value rather than
     *  echoing the nonsense back. */
    asEdited() {
        return new OklchColor([this.coords[0], this.coords[1], this.coords[2]], this.alpha, this.format, null);
    }
    oklchObj(withAlpha = true) {
        // Opaque colours use alpha 1 (not null): colorjs serialises a null alpha
        // as `/ none` / hex `00`, which renders transparent. alpha 1 is omitted
        // from the output by default, so this stays clean for opaque values.
        return {
            spaceId: 'oklch',
            coords: [this.coords[0], this.coords[1], this.coords[2]],
            alpha: withAlpha && this.format.hasAlpha ? this.alpha : 1,
        };
    }
    // ---- Parsing ------------------------------------------------------------
    static fromString(css) {
        const trimmed = css.trim();
        // Clean input parses straight through (keeping its verbatim source format);
        // a messy paste is sanitised — `extractColorString` recovers the colour from
        // a CSS declaration / quoted value / `!important`, or rethrows on nonsense.
        let source = trimmed;
        let parsed;
        try {
            parsed = getColor(parse(trimmed));
        }
        catch (err) {
            const cleaned = extractColorString(trimmed);
            if (cleaned === null) {
                throw err;
            }
            source = cleaned;
            parsed = getColor(parse(cleaned));
        }
        const sid = parsed.space.id;
        const k = sid === 'oklch' ? parsed : to(parsed, 'oklch');
        const coords = [
            num(k.coords[0]),
            num(k.coords[1]),
            num(k.coords[2]),
        ];
        const alpha = parsed.alpha == null ? 1 : num(parsed.alpha);
        const isHex = source.startsWith('#');
        // Legacy comma syntax (`rgb(r, g, b)` / `rgba(r, g, b, a)`) is the CSS mode;
        // the modern space-separated `rgb(r g b)` stays plain RGB.
        const isCss = /^rgba?\(/i.test(source) && source.includes(',');
        const hasAlpha = alpha < 1 ||
            /^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/i.test(source) ||
            /\b(?:rgba|hsla)\s*\(/i.test(source) ||
            source.includes('/');
        const format = {
            spaceId: isHex ? 'srgb' : sid,
            isHex,
            isCss,
            hasAlpha,
        };
        return new OklchColor(coords, alpha, format, source);
    }
    static tryFromString(css) {
        try {
            return OklchColor.fromString(css);
        }
        catch {
            return null;
        }
    }
    /** Predicate for `accept`: is this a string the model can parse? */
    static isColorString(value) {
        return (typeof value === 'string' && OklchColor.tryFromString(value) !== null);
    }
    // ---- Serialisation ------------------------------------------------------
    /** CSS string for the binding, in the remembered/selected output format. */
    serialize() {
        if (this.source !== null) {
            return this.source;
        }
        const f = this.format;
        if (f.isHex) {
            // collapse:false keeps full-length hex (#ffffff, never #fff).
            return serialize(to(this.oklchObj(), 'srgb', { inGamut: true }), {
                format: 'hex',
                collapse: false,
            });
        }
        if (f.isCss) {
            // Legacy comma syntax, always 4-arg: `rgba(r, g, b, a)`.
            const c = to(this.oklchObj(false), 'srgb', { inGamut: true });
            const ch = (i) => Math.round(num(c.coords[i]) * 255);
            return `rgba(${ch(0)}, ${ch(1)}, ${ch(2)}, ${+this.alpha.toFixed(2)})`;
        }
        if (f.spaceId === 'srgb') {
            // colorjs only emits percentage rgb; build 0–255 integers (the form
            // people expect) instead.
            const c = to(this.oklchObj(false), 'srgb', { inGamut: true });
            const ch = (i) => Math.round(num(c.coords[i]) * 255);
            const a = f.hasAlpha ? ` / ${+this.alpha.toFixed(3)}` : '';
            return `rgb(${ch(0)} ${ch(1)} ${ch(2)}${a})`;
        }
        return serialize(to(this.oklchObj(), f.spaceId), { precision: 4 });
    }
    /**
     * The collapsed-row string: the *same rounded channel values the open inputs
     * show* (via `channelValues` + `digitsFor`), with channel units but no function
     * wrapper or colour-space name — so the row reads like the inputs and never
     * repeats the mode dropdown's label. `wrapReadout` turns it back into CSS for
     * editing. Distinct from `serialize()`, which keeps full precision for the value.
     */
    readoutString() {
        const mode = this.mode;
        if (mode === 'hex') {
            return this.gamutCss();
        }
        const chans = MODE_CHANNELS[mode];
        const v = this.channelValues(mode);
        const s = (i) => v[i].toFixed(digitsFor(chans[i].step));
        if (mode === 'css') {
            // CSS mode IS the legacy function form, so the row shows it in full
            // (always 4-arg) rather than as bare channels.
            return `rgba(${s(0)}, ${s(1)}, ${s(2)}, ${+this.alpha.toFixed(2)})`;
        }
        const a = this.format.hasAlpha ? ` / ${this.alpha.toFixed(2)}` : '';
        switch (mode) {
            case 'oklch':
            case 'oklab':
            case 'lch':
            case 'lab':
                return `${s(0)}% ${s(1)} ${s(2)}${a}`; // L is a percentage
            case 'hsl':
            case 'hwb':
                return `${s(0)} ${s(1)}% ${s(2)}%${a}`; // S/L or W/B are percentages
            case 'srgb':
            case 'p3':
            case 'rec2020':
                return `${s(0)} ${s(1)} ${s(2)}${a}`; // bare R G B
        }
    }
    /** Re-wrap the bare `readoutString()` channels into a full CSS string for the
     *  current mode, so a typed edit of the collapsed row round-trips. */
    wrapReadout(text) {
        switch (this.mode) {
            case 'hex':
                return text;
            case 'srgb':
                return `rgb(${text})`;
            case 'css':
                return `rgba(${text})`;
            case 'hsl':
                return `hsl(${text})`;
            case 'hwb':
                return `hwb(${text})`;
            case 'p3':
                return `color(display-p3 ${text})`;
            case 'rec2020':
                return `color(rec2020 ${text})`;
            default:
                return `${this.mode}(${text})`; // oklch / oklab / lch / lab
        }
    }
    /** Full-gamut CSS (`oklch(…)`) for painting the swatch in modern browsers. */
    displayCss() {
        return serialize(to(this.oklchObj(), 'oklch'));
    }
    /** Gamut-mapped sRGB hex, for the swatch fallback / hex field. Always
     *  full-length (`collapse:false` → `#ffffff`, never `#fff`). */
    gamutCss() {
        return serialize(to(this.oklchObj(), 'srgb', { inGamut: true }), {
            format: 'hex',
            collapse: false,
        });
    }
    // ---- Channel access -----------------------------------------------------
    /** Canonical coords converted into `mode`'s colorjs space (NaN coalesced to 0). */
    coordsIn(mode) {
        const sid = modeSpaceId(mode);
        const c = sid === 'oklch' ? this.oklchObj() : to(this.oklchObj(), sid);
        return {
            coords: [num(c.coords[0]), num(c.coords[1]), num(c.coords[2])],
            alpha: this.alpha,
        };
    }
    /** Per-channel values in display units for `mode`'s numeric inputs. */
    channelValues(mode) {
        const { coords } = this.coordsIn(mode);
        return MODE_CHANNELS[mode].map((ch, i) => {
            const v = coords[i] * ch.scale;
            // Snap float noise to 0 (so an achromatic/gamut-edge channel never shows as
            // "-0.00"), then clamp to the channel's range — matching the numeric inputs'
            // range constraint, so the inputs and the collapsed readout agree.
            return clamp(Math.abs(v) < 1e-4 ? 0 : v, ch.min, ch.max);
        });
    }
    /** New colour with channel `index` of `mode` set to `displayValue`. */
    withChannel(mode, index, displayValue) {
        const sid = modeSpaceId(mode);
        const { coords, alpha } = this.coordsIn(mode);
        const next = [coords[0], coords[1], coords[2]];
        next[index] = displayValue / MODE_CHANNELS[mode][index].scale;
        const k = to({ spaceId: sid, coords: next, alpha }, 'oklch');
        return new OklchColor([num(k.coords[0]), num(k.coords[1]), num(k.coords[2])], alpha, this.format, null);
    }
    withAlpha(alpha) {
        return new OklchColor([this.coords[0], this.coords[1], this.coords[2]], alpha, { ...this.format, hasAlpha: true }, null);
    }
    /** Whether the bound value carries an alpha channel (drives the alpha UI). */
    get hasAlpha() {
        return this.format.hasAlpha;
    }
    /** The edit mode the value currently serialises as (its output format). */
    get mode() {
        if (this.format.isHex) {
            return 'hex';
        }
        if (this.format.isCss) {
            return 'css';
        }
        // EditMode values are colorjs space ids, so a known space maps straight to
        // its mode; anything else (a98-rgb, xyz, …) falls back to OKLCH.
        const id = this.format.spaceId;
        return EDIT_MODES.includes(id) ? id : 'oklch';
    }
    /**
     * New colour serialised in `mode`'s format. The sRGB-bound modes (RGB / HSL /
     * HWB / HEX) can't hold a wider-gamut colour, so switching into one snaps it to
     * the nearest in-sRGB colour; the perceptual (OKLCH / OKLab / LCH / Lab) and
     * wide-RGB (P3 / Rec2020) modes keep the colour untouched.
     */
    withFormat(mode) {
        let coords = [this.coords[0], this.coords[1], this.coords[2]];
        if (SRGB_BOUND_MODES.includes(mode) && !this.inGamut('srgb')) {
            const back = to(to(this.oklchObj(false), 'srgb', { inGamut: true }), 'oklch');
            coords = [num(back.coords[0]), num(back.coords[1]), num(back.coords[2])];
        }
        return new OklchColor(coords, this.alpha, {
            spaceId: modeSpaceId(mode),
            isHex: mode === 'hex',
            isCss: mode === 'css',
            hasAlpha: this.format.hasAlpha,
        }, null);
    }
    /** OKLCH hue (degrees) — the fixed axis of the locked L×C area plane. */
    areaHue() {
        return this.coords[2];
    }
    /** New colour with the area plane's fixed hue (OKLCH H) set to `hue` (degrees). */
    withAreaHue(hue) {
        return new OklchColor([this.coords[0], this.coords[1], num(hue)], this.alpha, this.format, null);
    }
    /** Adopt coords from an arbitrary CSS string (e.g. the area picker's onChange). */
    withCss(css) {
        const k = to(getColor(parse(css)), 'oklch');
        return new OklchColor([num(k.coords[0]), num(k.coords[1]), num(k.coords[2])], this.alpha, this.format, null);
    }
    // ---- Misc ---------------------------------------------------------------
    inGamut(gamut) {
        return inGamut(to(this.oklchObj(false), gamut));
    }
    /** sRGB and P3 are the only gamuts with real consumer displays, so the readout
     *  names those two and lumps anything beyond P3 as "wide". */
    gamutLabel() {
        if (this.inGamut('srgb')) {
            return 'sRGB';
        }
        if (this.inGamut('p3')) {
            return 'P3';
        }
        return 'wide';
    }
    equals(other) {
        const e = 1e-6;
        return (
        // Output format is part of identity, so switching mode counts as a change
        // (re-serialises + re-renders the collapsed readout).
        this.format.spaceId === other.format.spaceId &&
            this.format.isHex === other.format.isHex &&
            this.format.isCss === other.format.isCss &&
            Math.abs(this.coords[0] - other.coords[0]) < e &&
            Math.abs(this.coords[1] - other.coords[1]) < e &&
            Math.abs(this.coords[2] - other.coords[2]) < e &&
            Math.abs(this.alpha - other.alpha) < e);
    }
}

const i=Symbol.for("preact-signals");function t(){if(e>1){e--;return}let i,t=!1;!function(){let i=r;r=void 0;while(void 0!==i){if(i.S.v===i.v)i.S.i=i.i;i=i.o;}}();while(void 0!==s){let n=s;s=void 0;u++;while(void 0!==n){const o=n.u;n.u=void 0;n.f&=-3;if(!(8&n.f)&&w(n))try{n.c();}catch(n){if(!t){i=n;t=!0;}}n=o;}}u=0;e--;if(t)throw i}let o,s;function h(i){const t=o;o=void 0;try{return i()}finally{o=t;}}let r,e=0,u=0,d=0,v=0;function l(i){if(void 0===o)return;let t=i.n;if(void 0===t||t.t!==o){t={i:0,S:i,p:o.s,n:void 0,t:o,e:void 0,x:void 0,r:t};if(void 0!==o.s)o.s.n=t;o.s=t;i.n=t;if(32&o.f)i.S(t);return t}else if(-1===t.i){t.i=0;if(void 0!==t.n){t.n.p=t.p;if(void 0!==t.p)t.p.n=t.n;t.p=o.s;t.n=void 0;o.s.n=t;o.s=t;}return t}}function y(i,t){this.v=i;this.i=0;this.n=void 0;this.t=void 0;this.l=0;this.W=null==t?void 0:t.watched;this.Z=null==t?void 0:t.unwatched;this.name=null==t?void 0:t.name;}y.prototype.brand=i;y.prototype.h=function(){return !0};y.prototype.S=function(i){const t=this.t;if(t!==i&&void 0===i.e){i.x=t;this.t=i;if(void 0!==t)t.e=i;else h(()=>{var i;null==(i=this.W)||i.call(this);});}};y.prototype.U=function(i){if(void 0!==this.t){const t=i.e,n=i.x;if(void 0!==t){t.x=n;i.e=void 0;}if(void 0!==n){n.e=t;i.x=void 0;}if(i===this.t){this.t=n;if(void 0===n)h(()=>{var i;null==(i=this.Z)||i.call(this);});}}};y.prototype.subscribe=function(i){return j(()=>{const t=this.value,n=o;o=void 0;try{i(t);}finally{o=n;}},{name:"sub"})};y.prototype.valueOf=function(){return this.value};y.prototype.toString=function(){return this.value+""};y.prototype.toJSON=function(){return this.value};y.prototype.peek=function(){return h(()=>this.value)};Object.defineProperty(y.prototype,"value",{get(){const i=l(this);if(void 0!==i)i.i=this.i;return this.v},set(i){if(i!==this.v){if(u>100)throw new Error("Cycle detected");!function(i){if(0!==e&&0===u)if(i.l!==d){i.l=d;r={S:i,v:i.v,i:i.i,o:r};}}(this);this.v=i;this.i++;v++;e++;try{for(let i=this.t;void 0!==i;i=i.x)i.t.N();}finally{t();}}}});function a(i,t){return new y(i,t)}function w(i){for(let t=i.s;void 0!==t;t=t.n)if(t.S.i!==t.i||!t.S.h()||t.S.i!==t.i)return !0;return !1}function _(i){for(let t=i.s;void 0!==t;t=t.n){const n=t.S.n;if(void 0!==n)t.r=n;t.S.n=t;t.i=-1;if(void 0===t.n){i.s=t;break}}}function b(i){let t,n=i.s;while(void 0!==n){const i=n.p;if(-1===n.i){n.S.U(n);if(void 0!==i)i.n=n.n;if(void 0!==n.n)n.n.p=i;}else t=n;n.S.n=n.r;if(void 0!==n.r)n.r=void 0;n=i;}i.s=t;}function p(i,t){y.call(this,void 0);this.x=i;this.s=void 0;this.g=v-1;this.f=4;this.W=null==t?void 0:t.watched;this.Z=null==t?void 0:t.unwatched;this.name=null==t?void 0:t.name;}p.prototype=new y;p.prototype.h=function(){this.f&=-3;if(1&this.f)return !1;if(32==(36&this.f))return !0;this.f&=-5;if(this.g===v)return !0;this.g=v;this.f|=1;if(this.i>0&&!w(this)){this.f&=-2;return !0}const i=o;try{_(this);o=this;const i=this.x();if(16&this.f||this.v!==i||0===this.i){this.v=i;this.f&=-17;this.i++;}}catch(i){this.v=i;this.f|=16;this.i++;}o=i;b(this);this.f&=-2;return !0};p.prototype.S=function(i){if(void 0===this.t){this.f|=36;for(let i=this.s;void 0!==i;i=i.n)i.S.S(i);}y.prototype.S.call(this,i);};p.prototype.U=function(i){if(void 0!==this.t){y.prototype.U.call(this,i);if(void 0===this.t){this.f&=-33;for(let i=this.s;void 0!==i;i=i.n)i.S.U(i);}}};p.prototype.N=function(){if(!(2&this.f)){this.f|=6;for(let i=this.t;void 0!==i;i=i.x)i.t.N();}};Object.defineProperty(p.prototype,"value",{get(){if(1&this.f)throw new Error("Cycle detected");const i=l(this);this.h();if(void 0!==i)i.i=this.i;if(16&this.f)throw this.v;return this.v}});function g(i,t){return new p(i,t)}function S(i){const n=i.m;i.m=void 0;if("function"==typeof n){e++;const s=o;o=void 0;try{n();}catch(t){i.f&=-2;i.f|=8;m(i);throw t}finally{o=s;t();}}}function m(i){for(let t=i.s;void 0!==t;t=t.n)t.S.U(t);i.x=void 0;i.s=void 0;S(i);}function x(i){if(o!==this)throw new Error("Out-of-order effect");b(this);o=i;this.f&=-2;if(8&this.f)m(this);t();}function E(i,t){this.x=i;this.m=void 0;this.s=void 0;this.u=void 0;this.f=32;this.name=null==t?void 0:t.name;}E.prototype.c=function(){const i=this.S();try{if(8&this.f)return;if(void 0===this.x)return;const t=this.x();if("function"==typeof t)this.m=t;}finally{i();}};E.prototype.S=function(){if(1&this.f)throw new Error("Cycle detected");this.f|=1;this.f&=-9;S(this);_(this);e++;const i=o;o=this;return x.bind(this,i)};E.prototype.N=function(){if(!(2&this.f)){this.f|=2;this.u=s;s=this;}};E.prototype.d=function(){this.f|=8;if(!(1&this.f))m(this);};E.prototype.dispose=function(){this.d();};function j(i,t){const n=new E(i,t);try{n.c();}catch(i){n.d();throw i}const o=n.d.bind(n);o[Symbol.dispose]=o;return o}

/*
 * OKLCH lightness×chroma plane compute — adapted from Adam Argyle's color-input
 * (MIT) https://github.com/argyleink/css-color-component
 *
 * Pure and synchronous: given a fixed hue and a canvas size, produce the
 * gradient pixels plus the gamut-boundary polylines. Lightness is the y axis
 * (top = 1) and chroma the x axis, stretched per-lightness so the P3 gamut fills
 * the canvas width. The original ran this in a Web Worker across many colour
 * spaces; locked to OKLCH it runs on the main thread, so it bundles via Rollup.
 */
/** Chroma the binary search never exceeds (past every real display gamut). */
const CHROMA_MAX = 0.5;
/** Gamut whose per-lightness max chroma is stretched to the canvas width. */
const STRETCH_GAMUT = 'p3';
/** Gradient is computed at 1/4 of the backing resolution, then scaled up. */
const PIXEL_DIVISOR = 4;
/** Boundary curves drawn over the plane, widest → narrowest. The stretch gamut
 *  (P3) is the canvas edge itself, so it is not in this list. */
const GAMUTS = [
    { space: 'prophoto-rgb', color: 'rgba(255,255,255,0.3)', width: 0.75, dash: [2, 3] },
    { space: 'rec2020', color: 'rgba(255,255,255,0.4)', width: 1, dash: [3, 3] },
    { space: 'srgb', color: 'rgba(255,255,255,0.7)', width: 1.5, dash: [] },
];
/** Linearly interpolate a LUT at normalised position `t` ∈ [0,1]. */
function lerpLUT(lut, t) {
    const n = lut.length - 1;
    const i = Math.max(0, Math.min(n, t * n));
    const lo = Math.floor(i);
    const hi = Math.min(lo + 1, n);
    const f = i - lo;
    return lut[lo] * (1 - f) + lut[hi] * f;
}
/** Is OKLCH (`L`, `C`, `hue`) inside `gamut`? */
function inOklchGamut(L, C, hue, gamut) {
    const c = to({ spaceId: 'oklch', coords: [L, C, hue], alpha: 1 }, gamut);
    return inGamut({ spaceId: gamut, coords: c.coords, alpha: null });
}
/** Max in-`gamut` chroma at each of `size` lightness samples (L 0→1), binary-searched. */
function computeChromaLUT(hue, gamut, size) {
    const lut = new Float64Array(size);
    for (let i = 0; i < size; i++) {
        const L = i / (size - 1);
        if (!inOklchGamut(L, 0, hue, gamut)) {
            lut[i] = 0;
            continue;
        }
        let lo = 0;
        let hi = CHROMA_MAX;
        for (let j = 0; j < 16; j++) {
            const mid = (lo + hi) / 2;
            if (inOklchGamut(L, mid, hue, gamut))
                lo = mid;
            else
                hi = mid;
        }
        lut[i] = lo;
    }
    return lut;
}
/** Quarter-res gradient pixels: x = chroma fraction, y = lightness (top = 1). */
function computePixels(hue, W, H, target, chromaLUT) {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
        const L = 1 - y / (H - 1);
        const maxC = lerpLUT(chromaLUT, L);
        for (let x = 0; x < W; x++) {
            const C = (x / (W - 1)) * maxC;
            const [r, g, b] = to({ spaceId: 'oklch', coords: [L, C, hue], alpha: null }, target)
                .coords;
            const i = (y * W + x) * 4;
            px[i] = Math.round(Math.max(0, Math.min(1, r ?? 0)) * 255);
            px[i + 1] = Math.round(Math.max(0, Math.min(1, g ?? 0)) * 255);
            px[i + 2] = Math.round(Math.max(0, Math.min(1, b ?? 0)) * 255);
            px[i + 3] = 255;
        }
    }
    return px;
}
/** For each gamut, the L→chroma boundary as canvas points (chroma normalised to
 *  the stretched P3 width, so curves wider than P3 sit at the right edge). */
function computeBoundaries(hue, W, H, dpr, chromaLUT) {
    const ROWS = 100;
    const out = [];
    for (const g of GAMUTS) {
        const points = [];
        try {
            for (let row = 0; row <= ROWS; row++) {
                const L = row / ROWS;
                if (!inOklchGamut(L, 0, hue, g.space))
                    continue;
                const maxOuter = lerpLUT(chromaLUT, L);
                if (maxOuter <= 0)
                    continue;
                let lo = 0;
                let hi = maxOuter;
                for (let i = 0; i < 10; i++) {
                    const mid = (lo + hi) / 2;
                    if (inOklchGamut(L, mid, hue, g.space))
                        lo = mid;
                    else
                        hi = mid;
                }
                points.push({ x: (lo / maxOuter) * W, y: (1 - L) * H });
            }
            out.push({
                points,
                color: g.color,
                lineWidth: g.width * dpr,
                dash: g.dash.map((d) => d * dpr),
            });
        }
        catch {
            /* skip a gamut colorjs can't convert to */
        }
    }
    return out;
}
/** Compute the plane: quarter-res gradient pixels + full-res boundary lines. */
function computeArea(req) {
    const backingW = Math.round(req.cssW * req.dpr);
    const backingH = Math.round(req.cssH * req.dpr);
    const W = Math.round(backingW / PIXEL_DIVISOR);
    const H = Math.round(backingH / PIXEL_DIVISOR);
    const target = req.supportsP3 ? 'p3' : 'srgb';
    const chromaLUT = computeChromaLUT(req.hue, STRETCH_GAMUT, 128);
    const pixels = computePixels(req.hue, W, H, target, chromaLUT);
    const boundaries = computeBoundaries(req.hue, backingW, backingH, req.dpr, chromaLUT);
    return { pixels: pixels.buffer, W, H, backingW, backingH, chromaLUT, boundaries };
}

/*
 * OKLCH colour-area picker — adapted from Adam Argyle's color-input (MIT)
 * https://github.com/argyleink/css-color-component
 *
 * Renders the OKLCH lightness×chroma plane at a fixed hue (with the sRGB/P3
 * gamut boundary) and handles pointer + keyboard editing. The chroma axis is
 * stretched so P3 fills the width — see ./area-compute for the maths. The
 * original drove a Web Worker across many colour spaces; this is the single
 * OKLCH path, computed synchronously on the main thread so it bundles via Rollup.
 */
/** Canvas chroma extent before the gamut LUT is ready (nominal OKLCH max). */
const NOMINAL_MAX_CHROMA = 0.37;
/** Detect wide-gamut canvas support by probing the actual API. */
const supportsP3Canvas = (() => {
    try {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        const ctx = c.getContext('2d', { colorSpace: 'display-p3' });
        return (ctx
            ?.getContextAttributes?.()
            ?.colorSpace === 'display-p3');
    }
    catch {
        return false;
    }
})();
const n = (x) => x == null || Number.isNaN(x) ? 0 : x;
function drawBoundary(ctx, b) {
    if (b.points.length < 2) {
        return;
    }
    ctx.save();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash(b.dash);
    ctx.beginPath();
    ctx.moveTo(b.points[0].x, b.points[0].y);
    for (let i = 1; i < b.points.length; i++) {
        ctx.lineTo(b.points[i].x, b.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
}
/** OKLCH colour-area picker over a fixed-hue lightness×chroma plane. */
class AreaPicker {
    #controller = new AbortController();
    #area;
    // Working colour as OKLCH [L, C, H]. `#dragging` mirrors it during a drag so
    // the thumb tracks the pointer without round-tripping through the binding.
    #color = a(null);
    #dragging = a(null);
    #chromaLUT = a(null);
    // When false, the gamut-boundary curves are hidden (sRGB-bound edit modes).
    #showBoundary = a(true);
    constructor(element, onChange) {
        this.#area = element;
        const canvas = element?.querySelector('.area-canvas');
        if (!element || !canvas) {
            return;
        }
        /** Emit the edited colour as an `oklch()` string for the binding to adopt. */
        const emit = (c, isDragging) => {
            onChange(`oklch(${n(c[0])} ${n(c[1])} ${n(c[2])})`, isDragging);
        };
        // ── Pointer editing: chroma = x, lightness = y ─────────────────────────
        const thumb = element.querySelector('.area-thumb');
        let offset = { x: 0, y: 0 };
        let rect = null;
        const fromPointer = (event) => {
            const base = this.#dragging.value ?? this.#color.value;
            if (!base) {
                return;
            }
            const lut = this.#chromaLUT.value;
            const r = rect ?? element.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (event.clientX - r.left) / r.width - offset.x));
            const y = Math.max(0, Math.min(1, 1 - (event.clientY - r.top) / r.height - offset.y));
            const maxC = lut ? lerpLUT(lut, y) : NOMINAL_MAX_CHROMA;
            const next = [y, x * maxC, base[2]];
            this.#dragging.value = next;
            emit(next, true);
        };
        element.addEventListener('pointerdown', (event) => {
            element.setPointerCapture(event.pointerId);
            rect = element.getBoundingClientRect();
            if (thumb && (event.target === thumb || thumb.contains(event.target))) {
                // Grab the thumb: remember the cursor→centre offset so it doesn't jump.
                const tr = thumb.getBoundingClientRect();
                const tcx = (tr.left + tr.width / 2 - rect.left) / rect.width;
                const tcy = 1 - (tr.top + tr.height / 2 - rect.top) / rect.height;
                offset = {
                    x: (event.clientX - rect.left) / rect.width - tcx,
                    y: 1 - (event.clientY - rect.top) / rect.height - tcy,
                };
                const base = this.#dragging.value ?? this.#color.value;
                if (base) {
                    this.#dragging.value = [base[0], base[1], base[2]];
                }
            }
            else {
                // Click on the canvas: jump the thumb to the cursor.
                offset = { x: 0, y: 0 };
                fromPointer(event);
            }
        }, { signal: this.#controller.signal });
        element.addEventListener('pointermove', (event) => {
            if (this.#dragging.value) {
                event.preventDefault();
                fromPointer(event);
            }
        }, { signal: this.#controller.signal });
        element.addEventListener('pointerup', (event) => {
            element.releasePointerCapture(event.pointerId);
            const final = this.#dragging.value;
            if (final) {
                emit(final, false); // non-dragging change so the text inputs commit
            }
            this.#dragging.value = null;
            offset = { x: 0, y: 0 };
            rect = null;
        }, { signal: this.#controller.signal });
        element.addEventListener('pointercancel', () => {
            this.#dragging.value = null;
            offset = { x: 0, y: 0 };
            rect = null;
        }, { signal: this.#controller.signal });
        // ── Keyboard editing: arrows step chroma / lightness ───────────────────
        element.addEventListener('keydown', (event) => {
            const base = this.#color.value;
            if (!base) {
                return;
            }
            let dx = 0;
            let dy = 0;
            switch (event.key) {
                case 'ArrowRight':
                    dx = 1;
                    break;
                case 'ArrowLeft':
                    dx = -1;
                    break;
                case 'ArrowUp':
                    dy = 1;
                    break;
                case 'ArrowDown':
                    dy = -1;
                    break;
                default:
                    return;
            }
            event.preventDefault();
            const [L, C, H] = base;
            const lut = this.#chromaLUT.value;
            const maxC = lut ? lerpLUT(lut, L) : NOMINAL_MAX_CHROMA;
            const nextC = Math.max(0, Math.min(maxC, C + dx * (maxC / 100)));
            const nextL = Math.max(0, Math.min(1, L + dy / 100));
            emit([nextL, nextC, H], false);
        }, { signal: this.#controller.signal });
        // ── Thumb position (mirrors the chroma stretch) ────────────────────────
        const cleanupThumb = j(() => {
            const c = this.#dragging.value ?? this.#color.value;
            if (!c) {
                return;
            }
            const lut = this.#chromaLUT.value;
            const maxC = lut ? lerpLUT(lut, c[0]) : NOMINAL_MAX_CHROMA;
            const x = maxC > 0 ? Math.min(100, (c[1] / maxC) * 100) : 0;
            this.#area?.style.setProperty('--thumb-x', `${x}%`);
            this.#area?.style.setProperty('--thumb-y', `${(1 - c[0]) * 100}%`);
        });
        // ── Dragging state (matches the native palette: dim the rest of the UI) ─
        const cleanupDrag = j(() => {
            const isDragging = this.#dragging.value != null;
            element.classList.toggle('dragging', isDragging);
            document.body.inert = isDragging;
        });
        // ── Render: one paint per frame when the hue or boundary toggles ───────
        const hue = g(() => (this.#dragging.value ?? this.#color.value)?.[2] ?? 0);
        let frame = null;
        let pendingHue = null;
        const cleanupRender = j(() => {
            pendingHue = hue.value;
            void this.#showBoundary.value; // re-render when the boundary is toggled
            if (frame !== null) {
                return;
            }
            frame = requestAnimationFrame(() => {
                frame = null;
                const renderHue = pendingHue ?? 0;
                pendingHue = null;
                if (!this.#color.value) {
                    return;
                }
                const colorSpace = supportsP3Canvas
                    ? 'display-p3'
                    : 'srgb';
                let res;
                try {
                    res = computeArea({
                        hue: renderHue,
                        cssW: canvas.clientWidth || 320,
                        cssH: canvas.clientHeight || 200,
                        dpr: window.devicePixelRatio || 1,
                        supportsP3: supportsP3Canvas,
                    });
                }
                catch {
                    return; // a bad compute frame must not throw uncaught out of rAF
                }
                this.#chromaLUT.value = res.chromaLUT;
                // Paint the low-res gradient offscreen, then scale it up smoothly.
                const off = document.createElement('canvas');
                off.width = res.W;
                off.height = res.H;
                const offCtx = off.getContext('2d', { colorSpace });
                if (!offCtx) {
                    return;
                }
                const img = offCtx.createImageData(res.W, res.H);
                img.data.set(new Uint8ClampedArray(res.pixels));
                offCtx.putImageData(img, 0, 0);
                canvas.width = res.backingW;
                canvas.height = res.backingH;
                const ctx = canvas.getContext('2d', { colorSpace });
                if (!ctx) {
                    return;
                }
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(off, 0, 0, res.backingW, res.backingH);
                if (this.#showBoundary.value) {
                    for (const b of res.boundaries) {
                        drawBoundary(ctx, b);
                    }
                }
            });
        });
        this.#controller.signal.addEventListener('abort', () => {
            cleanupThumb();
            cleanupDrag();
            cleanupRender();
            if (frame !== null) {
                cancelAnimationFrame(frame);
            }
            // Don't leave the page inert if disposed mid-drag.
            document.body.inert = false;
        });
    }
    setShowBoundary(value) {
        this.#showBoundary.value = value;
    }
    /** Adopt a new colour from any CSS string (converted to the OKLCH plane). */
    setValue(css) {
        try {
            const c = to(css, 'oklch');
            this.#color.value = [n(c.coords[0]), n(c.coords[1]), n(c.coords[2])];
        }
        catch {
            this.#color.value = null;
        }
    }
    unmount() {
        this.#controller.abort();
    }
}

/*
 * The colour area — Adam Argyle's vendored gamut `AreaPicker` (MIT) wrapped as a
 * Tweakpane sub-controller. The plane is locked to the OKLCH L×C plane in every
 * mode — like Tweakpane's native SV square, which never changes with the mode
 * dropdown — so the thumb never jumps on a mode switch. The sRGB/P3 gamut
 * boundary is drawn in the wide-gamut modes (hidden in the sRGB-bound ones).
 */
const cnSv = ClassName('svp');
class AreaController {
    element;
    value_;
    mode_;
    picker_;
    // True while writing the value in response to the picker's own onChange, so
    // the value->setValue binding doesn't echo back into it.
    fromArea_ = false;
    constructor(doc, config) {
        this.value_ = config.value;
        this.mode_ = config.mode;
        const root = doc.createElement('div');
        root.classList.add(cnSv());
        config.viewProps.bindClassModifiers(root);
        config.viewProps.bindTabIndex(root); // focusable, like the native SV palette
        const canvas = doc.createElement('canvas');
        // `area-canvas` is the hook AreaPicker queries; `tp-svpv_c` (the native SV
        // canvas class) gives it the exact native crosshair cursor + size.
        canvas.classList.add('area-canvas', cnSv('c'));
        root.appendChild(canvas);
        const thumb = doc.createElement('div');
        // Reuse the native SV-marker class so the selection circle is pixel-identical.
        thumb.classList.add('area-thumb', cnSv('m'));
        root.appendChild(thumb);
        this.element = root;
        this.picker_ = new AreaPicker(root, (css, isDragging) => {
            let next;
            try {
                next = this.value_.rawValue.withCss(css);
            }
            catch {
                return;
            }
            this.fromArea_ = true;
            this.value_.rawValue = next;
            this.fromArea_ = false;
            if (!isDragging) {
                this.sync_();
            }
        });
        bindValue(this.value_, () => {
            if (this.fromArea_) {
                return;
            }
            this.sync_();
        });
        // The plane stays OKLCH; only the boundary visibility tracks the mode.
        const syncBoundary = () => this.picker_.setShowBoundary(showsGamutBoundary(this.mode_.rawValue));
        syncBoundary();
        this.mode_.emitter.on('change', syncBoundary);
        config.viewProps.handleDispose(() => {
            this.picker_.unmount();
        });
    }
    sync_() {
        this.picker_.setValue(this.value_.rawValue.displayCss());
    }
    /** Re-render once the popup is visible (the canvas needs a real layout size). */
    refresh() {
        this.sync_();
    }
}

/*
 * Hue / alpha strips, reusing Tweakpane's native h-palette (`tp-hplv`) and
 * a-palette (`tp-aplv`) DOM + classes so the loaded Tweakpane CSS styles them
 * identically to the built-in picker. The hue strip edits the fixed axis of the
 * current mode's area plane (oklch H / okhsv h / hsl H); the alpha strip edits
 * alpha.
 */
const cnHpl = ClassName('hpl');
const cnApl = ClassName('apl');
class StripController {
    element;
    kind_;
    value_;
    mode_;
    markerElem_;
    fillElem_;
    constructor(doc, config) {
        this.kind_ = config.kind;
        this.value_ = config.value;
        this.mode_ = config.mode;
        this.onPoint_ = this.onPoint_.bind(this);
        this.refresh_ = this.refresh_.bind(this);
        const cn = config.kind === 'hue' ? cnHpl : cnApl;
        const root = doc.createElement('div');
        root.classList.add(cn());
        config.viewProps.bindClassModifiers(root);
        config.viewProps.bindTabIndex(root);
        if (config.kind === 'hue') {
            const bar = doc.createElement('div');
            bar.classList.add(cn('c')); // rainbow gradient comes from native CSS
            root.appendChild(bar);
            this.fillElem_ = bar;
            const marker = doc.createElement('div');
            marker.classList.add(cn('m'));
            root.appendChild(marker);
            this.markerElem_ = marker;
        }
        else {
            const bar = doc.createElement('div');
            bar.classList.add(cn('b'));
            root.appendChild(bar);
            const fill = doc.createElement('div');
            fill.classList.add(cn('c'));
            bar.appendChild(fill);
            this.fillElem_ = fill;
            const marker = doc.createElement('div');
            marker.classList.add(cn('m'));
            root.appendChild(marker);
            const preview = doc.createElement('div');
            preview.classList.add(cn('p'));
            marker.appendChild(preview);
            this.markerElem_ = marker;
        }
        this.element = root;
        const ph = new PointerHandler(root);
        ph.emitter.on('down', this.onPoint_);
        ph.emitter.on('move', this.onPoint_);
        ph.emitter.on('up', this.onPoint_);
        this.value_.emitter.on('change', this.refresh_);
        this.mode_.emitter.on('change', this.refresh_);
        this.refresh_();
    }
    onPoint_(ev) {
        const point = ev.data.point;
        if (!point) {
            return;
        }
        const t = Math.max(0, Math.min(1, point.x / ev.data.bounds.width));
        const c = this.value_.rawValue;
        // The area is locked to the OKLCH plane, so the hue strip edits OKLCH hue.
        this.value_.rawValue =
            this.kind_ === 'hue' ? c.withAreaHue(t * 360) : c.withAlpha(t);
    }
    refresh_() {
        const c = this.value_.rawValue;
        if (this.kind_ === 'hue') {
            const h = c.areaHue();
            this.markerElem_.style.left = `${(h / 360) * 100}%`;
            // Like native: fill the marker with the pure hue at its position, so it
            // blends into the rainbow (its white ring makes it visible) instead of
            // showing the muted current colour.
            this.markerElem_.style.backgroundColor = `hsl(${h} 100% 50%)`;
        }
        else {
            const [l, ch, hh] = c.coordsIn('oklch').coords;
            this.fillElem_.style.background = `linear-gradient(to right, oklch(${l} ${ch} ${hh} / 0), oklch(${l} ${ch} ${hh} / 1))`;
            this.markerElem_.style.left = `${c.alpha * 100}%`;
            this.markerElem_.style.backgroundColor = c.displayCss();
        }
    }
}

/*
 * The texts row, reusing Tweakpane's native `tp-coltxtv` DOM + classes (mode
 * <select> + dropdown chevron + per-channel inputs) so it's styled identically
 * to the built-in picker. Channel inputs reuse core's `NumberTextController`;
 * hex mode uses a single `TextController`.
 *
 * All value<->input syncing is gated by `syncing_` so programmatic updates never
 * feed back as user edits (otherwise rebuilds oscillate the shared value).
 */
const cn$1 = ClassName('coltxt');
class TextsController {
    element;
    doc_;
    value_;
    mode_;
    viewProps_;
    selectElem_;
    inputsElem_;
    gamutElem_;
    numberCs_ = [];
    hexC_ = null;
    syncing_ = false;
    measureCtx_ = null;
    constructor(doc, config) {
        this.doc_ = doc;
        this.value_ = config.value;
        this.mode_ = config.mode;
        this.viewProps_ = config.viewProps;
        this.onSelectChange_ = this.onSelectChange_.bind(this);
        this.onModeChange_ = this.onModeChange_.bind(this);
        this.onColorChange_ = this.onColorChange_.bind(this);
        const root = doc.createElement('div');
        root.classList.add(cn$1(), 'wgc-coltxt');
        config.viewProps.bindClassModifiers(root);
        // Header line: mode <select> + chevron (native markup) on the left, the
        // smallest-containing-gamut readout on the right. Giving the dropdown its
        // own line frees a full row for the channel numbers below.
        const head = doc.createElement('div');
        head.classList.add('wgc-coltxt_head');
        const modeWrap = doc.createElement('div');
        modeWrap.classList.add(cn$1('m'));
        const select = doc.createElement('select');
        select.classList.add(cn$1('ms'));
        config.viewProps.bindDisabled(select);
        EDIT_MODES.forEach((m) => {
            const opt = doc.createElement('option');
            opt.textContent = MODE_LABELS[m];
            opt.value = m;
            select.appendChild(opt);
        });
        select.value = this.mode_.rawValue;
        select.addEventListener('change', this.onSelectChange_);
        modeWrap.appendChild(select);
        const marker = doc.createElement('div');
        marker.classList.add(cn$1('mm'));
        marker.innerHTML = '<svg><path d="M5 7h6l-3 3 z"></path></svg>';
        modeWrap.appendChild(marker);
        head.appendChild(modeWrap);
        this.selectElem_ = select;
        const gamut = doc.createElement('div');
        gamut.classList.add('wgc-gamut');
        head.appendChild(gamut);
        this.gamutElem_ = gamut;
        root.appendChild(head);
        const inputs = doc.createElement('div');
        inputs.classList.add(cn$1('w'));
        root.appendChild(inputs);
        this.inputsElem_ = inputs;
        this.element = root;
        this.buildInputs_();
        this.refreshGamut_();
        this.value_.emitter.on('change', this.onColorChange_);
        this.mode_.emitter.on('change', this.onModeChange_);
        // Size the select once it's in the DOM (a microtask fires right after the
        // blade is mounted, and — unlike rAF — even in a background tab).
        queueMicrotask(() => this.sizeSelect_());
    }
    /** Re-measure the mode select; call when the picker becomes visible (the
     *  select can only be measured once it's in the DOM + styled). */
    refreshLayout() {
        this.sizeSelect_();
    }
    onSelectChange_() {
        const mode = this.selectElem_.value;
        this.mode_.rawValue = mode;
        // Re-format the bound value (and thus the collapsed readout) into the chosen
        // mode; the canonical OKLCH coords are untouched, so nothing is lost.
        this.value_.rawValue = this.value_.rawValue.withFormat(mode);
    }
    onModeChange_() {
        if (this.selectElem_.value !== this.mode_.rawValue) {
            this.selectElem_.value = this.mode_.rawValue;
        }
        this.sizeSelect_();
        this.buildInputs_();
    }
    /**
     * Size the mode <select> to its current label so the chevron stays beside the
     * text. Our OKLCH label is wider than native's 3-char options, so a fixed
     * (widest-option) width would leave a gap for shorter labels like RGB.
     */
    sizeSelect_() {
        const opt = this.selectElem_.options[this.selectElem_.selectedIndex];
        if (!opt) {
            return;
        }
        if (!this.measureCtx_) {
            this.measureCtx_ = this.doc_.createElement('canvas').getContext('2d');
        }
        const ctx = this.measureCtx_;
        if (!ctx) {
            return;
        }
        const cs = getComputedStyle(this.selectElem_);
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const w = ctx.measureText(opt.text).width;
        // label width + native's horizontal padding (4px left + 18px right chevron)
        this.selectElem_.style.width = `${Math.ceil(w) + 22}px`;
    }
    onColorChange_() {
        this.refreshGamut_();
        if (this.syncing_) {
            return;
        }
        this.refreshInputs_();
    }
    /** Update the gamut readout (the smallest gamut containing the colour). */
    refreshGamut_() {
        this.gamutElem_.textContent = this.value_.rawValue.gamutLabel();
    }
    /** Wrap an input in a `tp-coltxtv_c` cell, like native (provides the spacing). */
    appendInput_(el) {
        const cell = this.doc_.createElement('div');
        cell.classList.add(cn$1('c'));
        cell.appendChild(el);
        this.inputsElem_.appendChild(cell);
    }
    buildInputs_() {
        this.syncing_ = true;
        try {
            const doc = this.doc_;
            const mode = this.mode_.rawValue;
            this.numberCs_ = [];
            this.hexC_ = null;
            this.inputsElem_.textContent = '';
            if (mode === 'hex') {
                const tc = new TextController(doc, {
                    parser: (t) => t,
                    props: ValueMap.fromObject({ formatter: (v) => v }),
                    value: createValue(this.value_.rawValue.gamutCss()),
                    viewProps: this.viewProps_,
                });
                tc.value.emitter.on('change', () => {
                    if (this.syncing_) {
                        return;
                    }
                    const parsed = OklchColor.tryFromString(tc.value.rawValue);
                    if (parsed) {
                        this.value_.rawValue = parsed;
                    }
                });
                this.appendInput_(tc.view.element);
                this.hexC_ = tc;
                return;
            }
            const channels = MODE_CHANNELS[mode];
            const vals = this.value_.rawValue.channelValues(mode);
            this.numberCs_ = channels.map((ch, i) => {
                // Clamp to the channel's range (e.g. RGB stops at 255) on both drag
                // and typed entry. OKLCH chroma's cap is generous (0.5, past every
                // real gamut) so wide-gamut colours still fit.
                const cr = createRangeConstraint({ min: ch.min, max: ch.max });
                const nc = new NumberTextController(doc, {
                    parser: parseNumber,
                    props: ValueMap.fromObject({
                        formatter: createNumberFormatter(digitsFor(ch.step)),
                        keyScale: ch.step,
                        pointerScale: ch.step,
                    }),
                    value: createValue(vals[i], cr ? { constraint: cr } : undefined),
                    viewProps: this.viewProps_,
                    arrayPosition: i === 0 ? 'fst' : i === channels.length - 1 ? 'lst' : 'mid',
                });
                nc.value.emitter.on('change', () => {
                    if (this.syncing_) {
                        return;
                    }
                    this.value_.rawValue = this.value_.rawValue.withChannel(mode, i, nc.value.rawValue);
                });
                this.appendInput_(nc.view.element);
                return nc;
            });
        }
        finally {
            this.syncing_ = false;
        }
    }
    refreshInputs_() {
        this.syncing_ = true;
        try {
            const mode = this.mode_.rawValue;
            if (mode === 'hex') {
                if (this.hexC_) {
                    this.hexC_.value.rawValue = this.value_.rawValue.gamutCss();
                }
            }
            else {
                const vals = this.value_.rawValue.channelValues(mode);
                this.numberCs_.forEach((nc, i) => {
                    nc.value.rawValue = vals[i];
                });
            }
        }
        finally {
            this.syncing_ = false;
        }
    }
}

/*
 * The picker body, reusing Tweakpane's native `tp-colpv` layout: an `_hsv` block
 * (colour area + hue strip), the `_rgb` texts row, and — when the value has alpha
 * — an `_a` row holding the alpha strip (`_ap`) + an alpha number input (`_at`).
 * The mode value is owned here and shared with the area, hue strip and texts row.
 */
const cn = ClassName('colp');
class PickerController {
    element;
    mode;
    area_;
    texts_;
    constructor(doc, config) {
        // Start in the value's own mode, so the dropdown + collapsed readout agree.
        this.mode = createValue(config.value.rawValue.mode);
        const shared = {
            value: config.value,
            mode: this.mode,
            viewProps: config.viewProps,
        };
        const root = doc.createElement('div');
        root.classList.add(cn());
        config.viewProps.bindClassModifiers(root);
        // HSV block: colour area + hue strip.
        const hsv = doc.createElement('div');
        hsv.classList.add(cn('hsv'));
        root.appendChild(hsv);
        const svWrap = doc.createElement('div');
        svWrap.classList.add(cn('sv'));
        this.area_ = new AreaController(doc, shared);
        svWrap.appendChild(this.area_.element);
        hsv.appendChild(svWrap);
        const hWrap = doc.createElement('div');
        hWrap.classList.add(cn('h'));
        const hue = new StripController(doc, { kind: 'hue', ...shared });
        hWrap.appendChild(hue.element);
        hsv.appendChild(hWrap);
        // Texts row (mode dropdown + channel inputs).
        const rgb = doc.createElement('div');
        rgb.classList.add(cn('rgb'));
        this.texts_ = new TextsController(doc, shared);
        rgb.appendChild(this.texts_.element);
        root.appendChild(rgb);
        // Alpha row — only when the bound value carries alpha (matches native).
        if (config.value.rawValue.hasAlpha) {
            root.appendChild(this.createAlphaRow_(doc, config.value, shared));
        }
        // Follow the value's output format: typing a different-format colour into
        // the text field (e.g. a hex while in OKLCH mode) re-points the mode
        // dropdown, so it never disagrees with the collapsed readout.
        config.value.emitter.on('change', () => {
            const mode = config.value.rawValue.mode;
            if (mode !== this.mode.rawValue) {
                this.mode.rawValue = mode;
            }
        });
        this.element = root;
    }
    createAlphaRow_(doc, value, shared) {
        const row = doc.createElement('div');
        row.classList.add(cn('a'));
        const apWrap = doc.createElement('div');
        apWrap.classList.add(cn('ap'));
        const strip = new StripController(doc, { kind: 'alpha', ...shared });
        apWrap.appendChild(strip.element);
        row.appendChild(apWrap);
        const atWrap = doc.createElement('div');
        atWrap.classList.add(cn('at'));
        const aCr = createRangeConstraint({ min: 0, max: 1 });
        const num = new NumberTextController(doc, {
            parser: parseNumber,
            props: ValueMap.fromObject({
                formatter: createNumberFormatter(2),
                keyScale: 0.1,
                pointerScale: 0.01,
            }),
            value: createValue(value.rawValue.alpha, aCr ? { constraint: aCr } : undefined),
            viewProps: shared.viewProps,
        });
        let syncing = false;
        num.value.emitter.on('change', () => {
            if (syncing) {
                return;
            }
            const a = Math.max(0, Math.min(1, num.value.rawValue));
            value.rawValue = value.rawValue.withAlpha(a);
        });
        value.emitter.on('change', () => {
            syncing = true;
            num.value.rawValue = value.rawValue.alpha;
            syncing = false;
        });
        atWrap.appendChild(num.view.element);
        row.appendChild(atWrap);
        return row;
    }
    /** Re-render the area + size the mode select after the popup opens (both need
     *  a real, visible layout). */
    refresh() {
        this.area_.refresh();
        this.texts_.refreshLayout();
    }
    /** Move focus into the picker so focus-out can later auto-close it. */
    focus() {
        this.area_.element.focus();
    }
}

/*
 * Top-level colour view, reusing Tweakpane's native `tp-colv` layout (header with
 * swatch + colour text field, plus the popup container) so sizing, padding and
 * margins match the built-in picker exactly.
 */
const cnCol = ClassName('col');
const cnSw = ClassName('colsw');
class ColorView {
    element;
    swatchButtonElement;
    swatchBoxElement;
    textElement;
    constructor(doc, config) {
        const root = doc.createElement('div');
        root.classList.add(cnCol(), cnCol(undefined, 'cpl'));
        config.viewProps.bindClassModifiers(root);
        config.foldable.bindExpandedClass(root, cnCol(undefined, 'expanded'));
        const head = doc.createElement('div');
        head.classList.add(cnCol('h'));
        root.appendChild(head);
        const swatchWrap = doc.createElement('div');
        swatchWrap.classList.add(cnCol('s'));
        head.appendChild(swatchWrap);
        const swatch = doc.createElement('div');
        swatch.classList.add(cnSw());
        config.viewProps.bindClassModifiers(swatch);
        swatchWrap.appendChild(swatch);
        const box = doc.createElement('div');
        box.classList.add(cnSw('sw'));
        swatch.appendChild(box);
        this.swatchBoxElement = box;
        const button = doc.createElement('button');
        button.classList.add(cnSw('b'));
        config.viewProps.bindDisabled(button);
        swatch.appendChild(button);
        this.swatchButtonElement = button;
        const text = doc.createElement('div');
        text.classList.add(cnCol('t'));
        head.appendChild(text);
        this.textElement = text;
        this.element = root;
    }
}

/*
 * Top-level colour controller — composes the swatch button, the colour text
 * field, and the popup picker over a single bound `OklchColor` value. Mirrors
 * Tweakpane's native `ColorController` (popup layout).
 */
class ColorController {
    value;
    view;
    viewProps;
    foldable_;
    picker_;
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.onButtonClick_ = this.onButtonClick_.bind(this);
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.onDocPointerDown_ = this.onDocPointerDown_.bind(this);
        this.onKeydown_ = this.onKeydown_.bind(this);
        this.foldable_ = Foldable.create(config.expanded ?? false);
        this.view = new ColorView(doc, {
            viewProps: this.viewProps,
            foldable: this.foldable_,
        });
        this.view.swatchButtonElement.addEventListener('click', this.onButtonClick_);
        // Close on a pointer-down outside this colour view. Deliberately focus-
        // INDEPENDENT, so it's robust in Safari — which doesn't move focus to a
        // clicked button / tabindex element and doesn't reliably set a focus
        // relatedTarget (the gap @tweakpane/core's own `findNextTarget` leaves as a
        // "TODO: Workaround for Safari", where a focus-based close mis-fires). It also
        // gives "one open at a time": a pointer-down on another swatch is outside this
        // view, so this popup closes.
        doc.addEventListener('pointerdown', this.onDocPointerDown_, true);
        this.view.element.addEventListener('keydown', this.onKeydown_);
        this.viewProps.handleDispose(() => {
            doc.removeEventListener('pointerdown', this.onDocPointerDown_, true);
        });
        // Colour text field, two-way bound directly to the colour value. The header
        // is tight, so we show just the channel numbers — no `oklch(`…`)` wrapper
        // and no `display-p3`/`rec2020` name (the mode dropdown already says it);
        // hex stays as `#…`. Editing accepts a full colour string, or bare numbers
        // re-wrapped into the current mode's form via `wrapReadout`.
        const textC = new TextController(doc, {
            parser: (text) => {
                const t = text.trim();
                // `.asEdited()` drops the verbatim source so the result re-serialises
                // from its clamped coords — an out-of-range entry (e.g. a chroma of
                // 40000) shows as the clamped value instead of echoing the nonsense.
                const direct = OklchColor.tryFromString(t);
                if (direct) {
                    return direct.asEdited();
                }
                const wrapped = OklchColor.tryFromString(this.value.rawValue.wrapReadout(t));
                return wrapped ? wrapped.asEdited() : null;
            },
            props: ValueMap.fromObject({
                formatter: (c) => c.readoutString(),
            }),
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view.textElement.appendChild(textC.view.element);
        this.picker_ = new PickerController(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        const popC = new PopupController(doc, { viewProps: this.viewProps });
        this.view.element.appendChild(popC.view.element);
        popC.view.element.appendChild(this.picker_.element);
        connectValues({
            primary: this.foldable_.value('expanded'),
            secondary: popC.shows,
            forward: (p) => p,
            backward: (_, s) => s,
        });
        this.value.emitter.on('change', this.onValueChange_);
        this.refreshSwatch_();
        // On open: re-render the area (the canvas needs a real size) and move focus
        // into the picker for keyboard navigation.
        this.foldable_.value('expanded').emitter.on('change', () => {
            if (this.foldable_.get('expanded')) {
                requestAnimationFrame(() => {
                    this.picker_.refresh();
                    this.picker_.focus();
                });
            }
        });
    }
    onDocPointerDown_(e) {
        if (!this.foldable_.get('expanded')) {
            return;
        }
        const target = e.target;
        if (!target || !this.view.element.contains(target)) {
            this.foldable_.set('expanded', false);
        }
    }
    onKeydown_(e) {
        if (e.key === 'Escape' && this.foldable_.get('expanded')) {
            this.foldable_.set('expanded', false);
            this.view.swatchButtonElement.focus();
        }
    }
    refreshSwatch_() {
        this.view.swatchBoxElement.style.backgroundColor =
            this.value.rawValue.displayCss();
    }
    onValueChange_() {
        this.refreshSwatch_();
    }
    onButtonClick_() {
        this.foldable_.set('expanded', !this.foldable_.get('expanded'));
    }
}

/**
 * Drop-in OKLCH colour picker. Because Tweakpane tries registered plugins before
 * its built-ins, this claims any colour-string binding and replaces the native
 * picker — no `view` parameter required.
 */
const OklchInputPlugin = createPlugin({
    id: 'input-wide-gamut',
    type: 'input',
    accept(exValue, params) {
        if (!OklchColor.isColorString(exValue)) {
            return null;
        }
        const result = parseRecord(params, (p) => ({
            expanded: p.optional.boolean,
        }));
        if (!result) {
            return null;
        }
        return {
            initialValue: exValue,
            params: result,
        };
    },
    binding: {
        reader: (_args) => (exValue) => OklchColor.fromString(String(exValue)),
        equals: (a, b) => a.equals(b),
        writer: (_args) => (target, inValue) => {
            target.write(inValue.serialize());
        },
    },
    controller(args) {
        return new ColorController(args.document, {
            value: args.value,
            viewProps: args.viewProps,
            expanded: args.params.expanded,
        });
    },
});

// Tweakpane plugin-bundle exports. `.area-canvas{touch-action:none}.area-thumb{left:var(--thumb-x, 50%);pointer-events:none;top:var(--thumb-y, 50%)}.tp-coltxtv.wgc-coltxt{display:flex;flex-direction:column;gap:2px}.wgc-coltxt_head{align-items:center;display:flex;justify-content:space-between}.wgc-gamut{color:var(--lbl-fg);padding-right:4px;white-space:nowrap}` is replaced with the compiled SCSS
// at build time by @rollup/plugin-replace (see rollup.config.js).
const id = 'wide-gamut';
const css = '.area-canvas{touch-action:none}.area-thumb{left:var(--thumb-x, 50%);pointer-events:none;top:var(--thumb-y, 50%)}.tp-coltxtv.wgc-coltxt{display:flex;flex-direction:column;gap:2px}.wgc-coltxt_head{align-items:center;display:flex;justify-content:space-between}.wgc-gamut{color:var(--lbl-fg);padding-right:4px;white-space:nowrap}';
const plugins = [OklchInputPlugin];

export { css, id, plugins };
