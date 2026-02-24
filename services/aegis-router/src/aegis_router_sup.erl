%%%-------------------------------------------------------------------
%%% @doc AegisComms Router Top-Level Supervisor
%%%
%%% Supervises all core router processes:
%%% - Connection Manager (WebSocket/TCP acceptor pool)
%%% - Message Router (encrypted blob routing)
%%% - Presence Tracker (online/offline status)
%%% - Offline Queue Manager (store-and-forward)
%%% - Delivery ACK Tracker (message delivery confirmation)
%%%
%%% Uses one_for_one restart strategy — if one child crashes,
%%% only that child is restarted. Erlang's "let it crash" philosophy.
%%%-------------------------------------------------------------------
-module(aegis_router_sup).
-behaviour(supervisor).

-export([start_link/0]).
-export([init/1]).

-define(SERVER, ?MODULE).

%%--------------------------------------------------------------------
%% @doc Start the supervisor
%%--------------------------------------------------------------------
start_link() ->
    supervisor:start_link({local, ?SERVER}, ?MODULE, []).

%%--------------------------------------------------------------------
%% @doc Supervisor initialization
%%--------------------------------------------------------------------
init([]) ->
    SupFlags = #{
        strategy  => one_for_one,
        intensity => 10,       %% Max 10 restarts
        period    => 60        %% Within 60 seconds
    },

    %% Child specifications for core router processes
    Children = [
        %% Connection Manager — handles WebSocket/TCP connections
        #{
            id       => aegis_connection_mgr,
            start    => {aegis_connection_mgr, start_link, []},
            restart  => permanent,
            shutdown => 5000,
            type     => worker,
            modules  => [aegis_connection_mgr]
        },

        %% Message Router — routes encrypted blobs between clients
        #{
            id       => aegis_message_router,
            start    => {aegis_message_router, start_link, []},
            restart  => permanent,
            shutdown => 5000,
            type     => worker,
            modules  => [aegis_message_router]
        },

        %% Presence Tracker — tracks online/offline/away status
        #{
            id       => aegis_presence,
            start    => {aegis_presence, start_link, []},
            restart  => permanent,
            shutdown => 5000,
            type     => worker,
            modules  => [aegis_presence]
        }
    ],

    {ok, {SupFlags, Children}}.
