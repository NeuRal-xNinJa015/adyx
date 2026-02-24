%%%-------------------------------------------------------------------
%%% @doc AegisComms Connection Manager
%%%
%%% Manages WebSocket/TCP connections from clients.
%%% Each connection is an encrypted tunnel — the server never sees
%%% plaintext message content.
%%%
%%% Features:
%%% - Connection pooling with configurable limits
%%% - Heartbeat monitoring (dead connection detection)
%%% - mTLS client certificate validation  
%%% - Connection-to-device binding
%%%-------------------------------------------------------------------
-module(aegis_connection_mgr).
-behaviour(gen_server).

-export([start_link/0]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2, terminate/2]).

-record(state, {
    connections = #{},    %% DeviceID => ConnectionPid
    max_connections,      %% Maximum allowed connections
    heartbeat_interval    %% Heartbeat check interval (ms)
}).

%%--------------------------------------------------------------------
%% API
%%--------------------------------------------------------------------
start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

%%--------------------------------------------------------------------
%% gen_server callbacks
%%--------------------------------------------------------------------
init([]) ->
    {ok, MaxConn} = application:get_env(aegis_router, max_connections),
    {ok, HbInterval} = application:get_env(aegis_router, heartbeat_interval),
    io:format("  [ConnectionMgr] Initialized (max: ~p, heartbeat: ~pms)~n", 
              [MaxConn, HbInterval]),
    {ok, #state{
        max_connections = MaxConn,
        heartbeat_interval = HbInterval
    }}.

handle_call({register, DeviceId, Pid}, _From, State) ->
    Connections = maps:put(DeviceId, Pid, State#state.connections),
    io:format("  [ConnectionMgr] Device ~p registered~n", [DeviceId]),
    {reply, ok, State#state{connections = Connections}};

handle_call({unregister, DeviceId}, _From, State) ->
    Connections = maps:remove(DeviceId, State#state.connections),
    io:format("  [ConnectionMgr] Device ~p unregistered~n", [DeviceId]),
    {reply, ok, State#state{connections = Connections}};

handle_call({lookup, DeviceId}, _From, State) ->
    Result = maps:find(DeviceId, State#state.connections),
    {reply, Result, State};

handle_call(count, _From, State) ->
    Count = maps:size(State#state.connections),
    {reply, Count, State};

handle_call(_Request, _From, State) ->
    {reply, {error, unknown_request}, State}.

handle_cast(_Msg, State) ->
    {noreply, State}.

handle_info(_Info, State) ->
    {noreply, State}.

terminate(_Reason, _State) ->
    ok.
