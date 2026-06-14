/// DeepForge — Strategy objects.
///
/// A compiled DeepForge strategy is published as a first-class, shared Sui
/// object: versioned, forkable (GitHub-for-strategies), and auditable. The
/// object stores a content hash of the canonical IR, a pointer to the full
/// execution plan (a Walrus blob id or an inline compact plan), the risk score,
/// and a packed simulation summary. Executing a strategy fires real DeepBook
/// Predict transactions elsewhere and emits `StrategyExecuted` here, linking the
/// strategy object to its on-chain activity for the visual replay / marketplace.
#[allow(lint(share_owned))]
module deepforge::strategy;

use std::string::String;
use sui::clock::Clock;
use sui::event;

/// A signed micro-USD value (PnL summary), packed as magnitude + sign.
public struct Signed has copy, drop, store {
    micro_usd: u64,
    is_negative: bool,
}

public struct Strategy has key, store {
    id: UID,
    author: address,
    /// Set when this strategy was forked from another.
    parent: Option<ID>,
    version: u64,
    name: String,
    /// Hex sha256 of the canonical IR — ties the object to a definition.
    ir_hash: String,
    /// Walrus blob id (or inline compact plan JSON) for the execution plan.
    plan_blob: String,
    /// Risk health score 0..100 (higher = safer).
    risk_score: u64,
    best: Signed,
    expected: Signed,
    worst: Signed,
    /// How many times this strategy has been forked.
    forks: u64,
    created_ms: u64,
}

// --- Events ---------------------------------------------------------------

public struct StrategyPublished has copy, drop {
    id: ID,
    author: address,
    name: String,
    ir_hash: String,
    parent: Option<ID>,
    risk_score: u64,
    created_ms: u64,
}

public struct StrategyForked has copy, drop {
    id: ID,
    parent: ID,
    author: address,
    created_ms: u64,
}

public struct StrategyExecuted has copy, drop {
    id: ID,
    executor: address,
    /// The DeepBook Predict execution tx digest (as text) for replay linking.
    digest: String,
    ms: u64,
}

// --- Constructors ---------------------------------------------------------

fun mk_signed(micro_usd: u64, is_negative: bool): Signed {
    Signed { micro_usd, is_negative }
}

fun new_strategy(
    parent: Option<ID>,
    name: String,
    ir_hash: String,
    plan_blob: String,
    risk_score: u64,
    best_micro: u64,
    best_neg: bool,
    expected_micro: u64,
    expected_neg: bool,
    worst_micro: u64,
    worst_neg: bool,
    clock: &Clock,
    ctx: &mut TxContext,
): Strategy {
    Strategy {
        id: object::new(ctx),
        author: ctx.sender(),
        parent,
        version: 1,
        name,
        ir_hash,
        plan_blob,
        risk_score,
        best: mk_signed(best_micro, best_neg),
        expected: mk_signed(expected_micro, expected_neg),
        worst: mk_signed(worst_micro, worst_neg),
        forks: 0,
        created_ms: clock.timestamp_ms(),
    }
}

/// Publish a freshly compiled strategy. Shares the object and returns its id.
public fun publish(
    name: String,
    ir_hash: String,
    plan_blob: String,
    risk_score: u64,
    best_micro: u64,
    best_neg: bool,
    expected_micro: u64,
    expected_neg: bool,
    worst_micro: u64,
    worst_neg: bool,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let s = new_strategy(
        option::none(),
        name,
        ir_hash,
        plan_blob,
        risk_score,
        best_micro,
        best_neg,
        expected_micro,
        expected_neg,
        worst_micro,
        worst_neg,
        clock,
        ctx,
    );
    let id = object::id(&s);
    event::emit(StrategyPublished {
        id,
        author: s.author,
        name: s.name,
        ir_hash: s.ir_hash,
        parent: s.parent,
        risk_score: s.risk_score,
        created_ms: s.created_ms,
    });
    transfer::share_object(s);
    id
}

/// Fork an existing strategy into a new derived strategy. Increments the
/// parent's fork counter, records the parent id on the child, and shares it.
public fun fork(
    parent: &mut Strategy,
    name: String,
    ir_hash: String,
    plan_blob: String,
    risk_score: u64,
    best_micro: u64,
    best_neg: bool,
    expected_micro: u64,
    expected_neg: bool,
    worst_micro: u64,
    worst_neg: bool,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    parent.forks = parent.forks + 1;
    let parent_id = object::id(parent);
    let s = new_strategy(
        option::some(parent_id),
        name,
        ir_hash,
        plan_blob,
        risk_score,
        best_micro,
        best_neg,
        expected_micro,
        expected_neg,
        worst_micro,
        worst_neg,
        clock,
        ctx,
    );
    let id = object::id(&s);
    event::emit(StrategyForked { id, parent: parent_id, author: s.author, created_ms: s.created_ms });
    event::emit(StrategyPublished {
        id,
        author: s.author,
        name: s.name,
        ir_hash: s.ir_hash,
        parent: s.parent,
        risk_score: s.risk_score,
        created_ms: s.created_ms,
    });
    transfer::share_object(s);
    id
}

/// Record that a strategy was executed on DeepBook Predict (for replay/feed).
public fun record_execution(
    s: &Strategy,
    digest: String,
    clock: &Clock,
    ctx: &TxContext,
) {
    event::emit(StrategyExecuted {
        id: object::id(s),
        executor: ctx.sender(),
        digest,
        ms: clock.timestamp_ms(),
    });
}

// --- Read accessors -------------------------------------------------------

public fun author(s: &Strategy): address { s.author }
public fun parent(s: &Strategy): Option<ID> { s.parent }
public fun version(s: &Strategy): u64 { s.version }
public fun forks(s: &Strategy): u64 { s.forks }
public fun risk_score(s: &Strategy): u64 { s.risk_score }
public fun ir_hash(s: &Strategy): String { s.ir_hash }
public fun plan_blob(s: &Strategy): String { s.plan_blob }
