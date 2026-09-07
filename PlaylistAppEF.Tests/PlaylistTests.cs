using Microsoft.EntityFrameworkCore;
using PlaylistAppEF.Data;
using PlaylistAppEF.Models;
using PlaylistAppEF.Repositories;
using Xunit;

namespace PlaylistAppEF.Tests;

/// <summary>
/// Tests unitaires dédiés aux playlists et à la relation N-N PlaylistChanson.
/// (Exécutés par .github/workflows/tp2-tests.yml — badge « TP2 – Tests »)
/// </summary>
public class PlaylistTests
{
    private static PlaylistContext CreerContextTest()
    {
        var options = new DbContextOptionsBuilder<PlaylistContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new PlaylistContext(options);
    }

    [Fact(DisplayName = "Une nouvelle playlist a 0 chanson")]
    public void NouvellePlaylist_EstVide()
    {
        var pl = new Playlist { Nom = "Test" };
        Assert.Empty(pl.PlaylistChansons);
        Assert.Equal(0, pl.NombreChansons);
    }

    [Fact(DisplayName = "CreeLe est renseigné à la création")]
    public void CreeLe_NouvelleInstance_EstRenseigne()
    {
        var avant = DateTime.UtcNow.AddSeconds(-1);
        var pl    = new Playlist();
        var apres = DateTime.UtcNow.AddSeconds(1);
        Assert.InRange(pl.CreeLe, avant, apres);
    }

    [Fact(DisplayName = "DureeTotal additionne les durées des chansons")]
    public async Task DureeTotal_PlaylistAvecChansons_SommeCorrecte()
    {
        using var ctx = CreerContextTest();
        var repo = new MusiqueRepository(ctx);
        var c1 = await repo.AjouterChansonAsync(new Chanson { Titre="A", Artiste="x", Album="x", DureeSecondes=200, Genre="Pop", Annee=2020 });
        var c2 = await repo.AjouterChansonAsync(new Chanson { Titre="B", Artiste="x", Album="x", DureeSecondes=154, Genre="Pop", Annee=2020 });
        var pl = await repo.CreerPlaylistAsync("Ma Playlist");
        await repo.AjouterChansonPlaylistAsync(pl.Id, c1.Id);
        await repo.AjouterChansonPlaylistAsync(pl.Id, c2.Id);

        var plChargee = await repo.ObtenirPlaylistAsync(pl.Id);

        Assert.NotNull(plChargee);
        Assert.Equal(354, plChargee!.DureeTotal); // 200 + 154
    }

    [Fact(DisplayName = "DureeTotaleFormatee formate mm:ss correctement")]
    public async Task DureeTotaleFormatee_354secondes_Retourne05min54s()
    {
        using var ctx = CreerContextTest();
        var repo = new MusiqueRepository(ctx);
        var c = await repo.AjouterChansonAsync(new Chanson { Titre="A", Artiste="x", Album="x", DureeSecondes=354, Genre="Pop", Annee=2020 });
        var pl = await repo.CreerPlaylistAsync("P");
        await repo.AjouterChansonPlaylistAsync(pl.Id, c.Id);

        var plChargee = await repo.ObtenirPlaylistAsync(pl.Id);

        Assert.Contains("05min", plChargee!.DureeTotaleFormatee());
    }

    [Fact(DisplayName = "La position des chansons s'incrémente automatiquement")]
    public async Task Position_AjoutsSuccessifs_Incremente()
    {
        using var ctx = CreerContextTest();
        var repo = new MusiqueRepository(ctx);
        var c1 = await repo.AjouterChansonAsync(new Chanson { Titre="A", Artiste="x", Album="x", DureeSecondes=100, Genre="Pop", Annee=2020 });
        var c2 = await repo.AjouterChansonAsync(new Chanson { Titre="B", Artiste="x", Album="x", DureeSecondes=100, Genre="Pop", Annee=2020 });
        var pl = await repo.CreerPlaylistAsync("P");
        await repo.AjouterChansonPlaylistAsync(pl.Id, c1.Id);
        await repo.AjouterChansonPlaylistAsync(pl.Id, c2.Id);

        var plChargee = await repo.ObtenirPlaylistAsync(pl.Id);
        var positions = plChargee!.PlaylistChansons.OrderBy(pc => pc.Position).Select(pc => pc.Position).ToList();

        Assert.Equal(new[] { 1, 2 }, positions);
    }

    [Fact(DisplayName = "SupprimerPlaylist supprime aussi les liaisons (CASCADE)")]
    public async Task SupprimerPlaylist_AvecChansons_SupprimeLiaisons()
    {
        using var ctx = CreerContextTest();
        var repo = new MusiqueRepository(ctx);
        var c = await repo.AjouterChansonAsync(new Chanson { Titre="A", Artiste="x", Album="x", DureeSecondes=100, Genre="Pop", Annee=2020 });
        var pl = await repo.CreerPlaylistAsync("P");
        await repo.AjouterChansonPlaylistAsync(pl.Id, c.Id);

        bool ok = await repo.SupprimerPlaylistAsync(pl.Id);

        Assert.True(ok);
        // La chanson existe toujours, mais plus aucune liaison
        Assert.Single(await repo.ObtenirToutesChansonsAsync());
        Assert.Empty(await ctx.PlaylistChansons.ToListAsync());
    }
}
