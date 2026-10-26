from app.cli import COMMANDS, build_parser


def test_every_command_has_a_handler():
    parser = build_parser()
    choices = parser._subparsers._group_actions[0].choices
    assert set(COMMANDS) == set(choices)
