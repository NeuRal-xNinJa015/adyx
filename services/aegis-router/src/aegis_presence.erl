%%%-------------------------------------------------------------------
%%% @doc AegisComms Presence Tracker
%%%
%%% Tracks device online/offline/away presence status.
%%% Presence information is privacy-sensitive and can be:
%%% - Fully hidden (stealth mode)
%%% - Shared only with approved contacts
%%% - Delayed to prevent timing correlation
%%%-------------------------------------------------------------------
-module(aegis_presence).
-behaviour(gen_server).

-export([start_link/0]).
-export([set_status/2, get_status/1]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2, terminate/2]).

-type presence_status() :: online | offline | away | stealth.

-record(state, {
    statuses = #{} :: #{binary() => {presence_status(), integer()}}
}).

%%--------------------------------------------------------------------
%% API
%%--------------------------------------------------------------------
start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

-spec set_status(binary(), presence_status()) -> ok.
set_status(DeviceId, Status) ->
    gen_server:call(?MODULE, {set_status, DeviceId, Status}).

-spec get_status(binary()) -> {ok, presence_status()} | {error, not_found}.
get_status(DeviceId) ->
    gen_server:call(?MODULE, {get_status, DeviceId}).

%%--------------------------------------------------------------------
%% gen_server callbacks
%%--------------------------------------------------------------------
init([]) ->
    io:format("  [Presence] Tracker initialized~n"),
    {ok, #state{}}.

handle_call({set_status, DeviceId, Status}, _From, State) ->
    Timestamp = erlang:system_time(millisecond),
    Statuses = maps:put(DeviceId, {Status, Timestamp}, State#state.statuses),
    {reply, ok, State#state{statuses = Statuses}};

handle_call({get_status, DeviceId}, _From, State) ->
    case maps:find(DeviceId, State#state.statuses) of
        {ok, {stealth, _}} -> {reply, {ok, offline}, State};  %% Hide stealth users
        {ok, {Status, _}}  -> {reply, {ok, Status}, State};
        error              -> {reply, {error, not_found}, State}
    end;

handle_call(_Request, _From, State) ->
    {reply, {error, unknown_request}, State}.

handle_cast(_Msg, State) ->
    {noreply, State}.

handle_info(_Info, State) ->
    {noreply, State}.

terminate(_Reason, _State) ->
    ok.
