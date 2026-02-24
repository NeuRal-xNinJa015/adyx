%%%-------------------------------------------------------------------
%%% @doc AegisComms Message Router
%%%
%%% Routes encrypted message blobs between connected devices.
%%% The router NEVER decrypts messages — it only handles delivery.
%%% 
%%% Zero-knowledge design:
%%% - Messages are opaque encrypted blobs
%%% - Router only knows: sender device ID, recipient device ID
%%% - Message content is E2E encrypted (Signal Protocol)
%%%
%%% Delivery modes:
%%% - Online: direct WebSocket push
%%% - Offline: queue for later delivery
%%% - Group: fan-out to all group members
%%%-------------------------------------------------------------------
-module(aegis_message_router).
-behaviour(gen_server).

-export([start_link/0]).
-export([route/3]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2, terminate/2]).

-record(state, {
    pending_acks = #{},    %% MessageID => {SenderDevice, Timestamp}
    message_count = 0      %% Total messages routed
}).

%%--------------------------------------------------------------------
%% API
%%--------------------------------------------------------------------
start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

%% @doc Route an encrypted message blob from sender to recipient
-spec route(binary(), binary(), binary()) -> ok | {error, term()}.
route(SenderDeviceId, RecipientDeviceId, EncryptedBlob) ->
    gen_server:call(?MODULE, {route, SenderDeviceId, RecipientDeviceId, EncryptedBlob}).

%%--------------------------------------------------------------------
%% gen_server callbacks
%%--------------------------------------------------------------------
init([]) ->
    io:format("  [MessageRouter] Initialized — zero-knowledge routing active~n"),
    {ok, #state{}}.

handle_call({route, SenderDeviceId, RecipientDeviceId, EncryptedBlob}, _From, State) ->
    %% Look up recipient connection
    case gen_server:call(aegis_connection_mgr, {lookup, RecipientDeviceId}) of
        {ok, _Pid} ->
            %% Recipient online — deliver directly
            %% TODO: Send EncryptedBlob via WebSocket to Pid
            NewCount = State#state.message_count + 1,
            io:format("  [MessageRouter] Routed msg #~p: ~p -> ~p (ONLINE)~n", 
                      [NewCount, SenderDeviceId, RecipientDeviceId]),
            {reply, ok, State#state{message_count = NewCount}};
        error ->
            %% Recipient offline — queue for later
            %% TODO: Store in offline queue (Redis/Cassandra)
            NewCount = State#state.message_count + 1,
            io:format("  [MessageRouter] Queued msg #~p: ~p -> ~p (OFFLINE)~n",
                      [NewCount, SenderDeviceId, RecipientDeviceId]),
            {reply, {queued, offline}, State#state{message_count = NewCount}}
    end;

handle_call(_Request, _From, State) ->
    {reply, {error, unknown_request}, State}.

handle_cast(_Msg, State) ->
    {noreply, State}.

handle_info(_Info, State) ->
    {noreply, State}.

terminate(_Reason, _State) ->
    ok.
